import {
  ActionMenu,
  colors,
  type Frame,
  ICON_STROKE,
  IconButton,
  PRESSED_OPACITY,
  radii,
  sizes,
  spacing,
  Text,
  useToast,
} from "@native/design";
import { hasTag, noteQuery, useUpdateNote } from "@native/lib/api";
import { useQuery } from "@tanstack/react-query";
import { useLocalSearchParams, useRouter } from "expo-router";
import { Check, Keyboard, Pencil, Trash2, X } from "lucide-react-native";
import { useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  TextInput,
  View,
} from "react-native";
import { KeyboardStickyView } from "react-native-keyboard-controller";
import { useSafeAreaInsets } from "react-native-safe-area-context";

// #31's measurements: the buttons 8 under the safe area, the text 16 under them, a 28pt line pitch.
const BAR_TOP = 8;
const TEXT_GAP = 16;
const LINE_HEIGHT = 28;
const TOGGLE_GAP = 12;
const MENU_GAP = 8;

export const EDITOR_COPY = {
  discard: "Discard changes",
  error: "Couldn’t save your changes. Try again.",
  hideKeyboard: "Hide keyboard",
  keep: "Keep editing",
  showKeyboard: "Show keyboard",
  trashed: "This note was moved to trash.",
} as const;

// The raw markdown editor (#31; docs/spec/phase-4.md §2.7). Closing a pristine editor asks nothing,
// as #31 showed; closing a dirty one offers Discard or Keep editing.
export default function NoteEditor() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const toast = useToast();
  const query = useQuery(noteQuery(id));
  const update = useUpdateNote(id);
  const input = useRef<TextInput>(null);
  const close = useRef<View>(null);

  const original = query.data?.bodyMarkdown;
  const [value, setValue] = useState<string | null>(original ?? null);
  const [focused, setFocused] = useState(false);
  const [discardFrame, setDiscardFrame] = useState<Frame | null>(null);

  useEffect(() => {
    if (value === null && original !== undefined) {
      setValue(original);
    }
  }, [original, value]);

  const text = value ?? "";
  const dirty = original !== undefined && text !== original;
  const saving = update.isPending;

  const onClose = () => {
    if (!dirty) {
      router.back();
      return;
    }
    close.current?.measureInWindow((x, y, width, height) =>
      setDiscardFrame({ height, width, x, y })
    );
  };

  const onSave = () => {
    if (!dirty) {
      router.back();
      return;
    }
    update.mutate(
      { bodyMarkdown: text },
      {
        onError: (error) => {
          if (hasTag(error, "NoteTrashed")) {
            router.dismissTo("/");
            toast.show({ message: EDITOR_COPY.trashed });
          }
        },
        onSuccess: () => router.back(),
      }
    );
  };

  const toggleKeyboard = () => {
    if (focused) {
      input.current?.blur();
    } else {
      input.current?.focus();
    }
  };

  const top = insets.top + BAR_TOP;
  const failed = update.isError && !hasTag(update.error, "NoteTrashed");

  return (
    <View style={styles.screen} testID="note-editor-screen">
      <TextInput
        autoCorrect
        autoFocus
        cursorColor={colors.accent.lime}
        editable={!saving}
        keyboardAppearance="dark"
        multiline
        onBlur={() => setFocused(false)}
        onChangeText={setValue}
        onFocus={() => setFocused(true)}
        ref={input}
        scrollEnabled
        selectionColor={colors.accent.lime}
        style={[
          styles.input,
          { paddingTop: top + sizes.iconButton + TEXT_GAP },
        ]}
        testID="note-editor-input"
        textAlignVertical="top"
        value={text}
      />

      <View pointerEvents="box-none" style={[styles.bar, { top }]}>
        <View collapsable={false} ref={close}>
          <IconButton
            accessibilityLabel="Close editor"
            icon={X}
            onPress={onClose}
            testID="note-editor-close"
          />
        </View>
        <Pressable
          accessibilityLabel="Save edits"
          accessibilityRole="button"
          accessibilityState={{ busy: saving }}
          disabled={saving}
          onPress={onSave}
          style={({ pressed }) => [
            styles.save,
            pressed ? styles.pressed : null,
          ]}
          testID="note-editor-save"
        >
          {saving ? (
            <ActivityIndicator color={colors.text.onLight} />
          ) : (
            <Check
              color={colors.text.onLight}
              size={sizes.glyph}
              strokeWidth={ICON_STROKE}
            />
          )}
        </Pressable>
      </View>

      {failed ? (
        <View
          style={[styles.error, { top: top + sizes.iconButton + spacing.xs }]}
          testID="note-editor-error"
        >
          <Text color={colors.destructive} variant="caption">
            {EDITOR_COPY.error}
          </Text>
        </View>
      ) : null}

      <KeyboardStickyView
        offset={{ closed: -(insets.bottom + TOGGLE_GAP), opened: -TOGGLE_GAP }}
        style={styles.toggle}
      >
        <IconButton
          accessibilityLabel={
            focused ? EDITOR_COPY.hideKeyboard : EDITOR_COPY.showKeyboard
          }
          icon={Keyboard}
          onPress={toggleKeyboard}
          testID="note-editor-keyboard-toggle"
        />
      </KeyboardStickyView>

      <ActionMenu
        anchor={
          discardFrame
            ? { align: "left", frame: discardFrame, gap: MENU_GAP }
            : null
        }
        entries={[
          {
            destructive: true,
            icon: Trash2,
            label: EDITOR_COPY.discard,
            onPress: () => {
              setDiscardFrame(null);
              router.back();
            },
            testID: "note-editor-discard",
          },
          {
            icon: Pencil,
            label: EDITOR_COPY.keep,
            onPress: () => setDiscardFrame(null),
            testID: "note-editor-keep",
          },
        ]}
        onClose={() => setDiscardFrame(null)}
        testID="note-editor-discard-menu"
      />
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {
    flexDirection: "row",
    justifyContent: "space-between",
    left: spacing.lg,
    position: "absolute",
    right: spacing.lg,
  },
  error: {
    backgroundColor: colors.bg.list,
    borderRadius: 12,
    left: spacing.lg,
    padding: spacing.sm,
    position: "absolute",
    right: spacing.lg,
  },
  input: {
    color: colors.text.primary,
    flex: 1,
    fontSize: 17,
    lineHeight: LINE_HEIGHT,
    paddingBottom: sizes.iconButton + spacing.xxl,
    paddingHorizontal: spacing.xl,
  },
  pressed: { opacity: PRESSED_OPACITY },
  save: {
    alignItems: "center",
    backgroundColor: colors.button.lightAlt,
    borderRadius: radii.pill,
    height: sizes.iconButton,
    justifyContent: "center",
    width: sizes.iconButton,
  },
  screen: { backgroundColor: colors.bg.app, flex: 1 },
  toggle: { bottom: 0, position: "absolute", right: spacing.lg },
});
