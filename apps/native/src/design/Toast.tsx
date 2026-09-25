import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { AccessibilityInfo, Pressable, StyleSheet, View } from "react-native";
import { useKeyboardState } from "react-native-keyboard-controller";
import Animated, { FadeIn, FadeOut } from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { FullWindowOverlay } from "react-native-screens";
import { Text } from "./Text";
import {
  colors,
  PRESSED_OPACITY,
  radii,
  sizes,
  spacing,
  typography,
} from "./tokens";

export type ToastAction = {
  readonly label: string;
  readonly onPress: () => void;
};

export type ToastInput = {
  readonly action?: ToastAction;
  readonly message: string;
};

type ToastState = ToastInput & { readonly id: number };

type ToastApi = {
  readonly hide: () => void;
  readonly show: (toast: ToastInput) => void;
};

export const TOAST_DURATION_MS = 5000;
const FADE_MS = 150;
const MIN_HEIGHT = 52;
// Home and the detail both float a 64pt bar 12 above the bottom safe area; the toast sits 12 above
// that bar (docs/spec/phase-4.md §2.9), so it never covers the FAB or the Ask pill.
const BAR_GAP = spacing.sm;

const ToastContext = createContext<ToastApi | null>(null);

export function useToast(): ToastApi {
  const api = useContext(ToastContext);
  if (!api) {
    throw new Error("useToast must be used under ToastProvider");
  }
  return api;
}

// One toast at a time: a new one replaces the old one and restarts the clock.
export function ToastProvider({ children }: { readonly children: ReactNode }) {
  const [toast, setToast] = useState<ToastState | null>(null);
  const nextId = useRef(0);

  const hide = useCallback(() => setToast(null), []);
  const show = useCallback((input: ToastInput) => {
    nextId.current += 1;
    setToast({ ...input, id: nextId.current });
    AccessibilityInfo.announceForAccessibility(input.message);
  }, []);

  useEffect(() => {
    if (!toast) {
      return;
    }
    const timer = setTimeout(() => setToast(null), TOAST_DURATION_MS);
    return () => clearTimeout(timer);
  }, [toast]);

  const api = useMemo(() => ({ hide, show }), [hide, show]);

  return (
    <ToastContext.Provider value={api}>
      {children}
      {toast ? <ToastView key={toast.id} onHide={hide} toast={toast} /> : null}
    </ToastContext.Provider>
  );
}

function ToastView({
  onHide,
  toast,
}: {
  readonly onHide: () => void;
  readonly toast: ToastInput;
}) {
  const insets = useSafeAreaInsets();
  const keyboard = useKeyboardState((state) =>
    state.isVisible ? state.height : 0
  );
  // Over the keyboard when it is up: a toast from a composer (the chat's mic) sat under it.
  const bottom =
    keyboard > 0
      ? keyboard + BAR_GAP
      : insets.bottom + BAR_GAP + sizes.askPill + BAR_GAP;
  // A window of its own, above every native modal: rendered in the root view, a toast raised from
  // a sheet or a modal (the chat, Add to folder) drew behind it and nobody saw it
  // (docs/parity/REPORT.md, #23).
  return (
    <FullWindowOverlay>
      <View pointerEvents="box-none" style={StyleSheet.absoluteFill}>
        <View pointerEvents="box-none" style={[styles.layer, { bottom }]}>
          <Toast
            action={
              toast.action
                ? {
                    label: toast.action.label,
                    onPress: () => {
                      onHide();
                      toast.action?.onPress();
                    },
                  }
                : undefined
            }
            message={toast.message}
          />
        </View>
      </View>
    </FullWindowOverlay>
  );
}

/** The toast itself, without the provider's placement: the gallery draws it inline. */
export function Toast({
  action,
  message,
  testID = "toast",
}: ToastInput & { readonly testID?: string }) {
  return (
    <Animated.View
      accessibilityLiveRegion="polite"
      entering={FadeIn.duration(FADE_MS)}
      exiting={FadeOut.duration(FADE_MS)}
      style={styles.toast}
      testID={testID}
    >
      <Text style={styles.message} testID={`${testID}-message`} variant="body">
        {message}
      </Text>
      {action ? (
        <Pressable
          accessibilityLabel={action.label}
          accessibilityRole="button"
          hitSlop={spacing.sm}
          onPress={action.onPress}
          style={({ pressed }) => [
            styles.action,
            pressed ? styles.pressed : null,
          ]}
          testID={`${testID}-action`}
        >
          <Text color={colors.accent.lime} variant="pillLabel">
            {action.label}
          </Text>
        </Pressable>
      ) : null}
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  action: {
    justifyContent: "center",
    minHeight: sizes.iconButton,
    paddingLeft: spacing.md,
  },
  layer: { left: spacing.lg, position: "absolute", right: spacing.lg },
  message: {
    flexShrink: 1,
    paddingVertical: (MIN_HEIGHT - typography.body.lineHeight) / 2,
  },
  pressed: { opacity: PRESSED_OPACITY },
  toast: {
    alignItems: "center",
    backgroundColor: colors.bg.sheet,
    borderColor: colors.border.hairline,
    borderRadius: radii.pill,
    borderWidth: sizes.hairline,
    flexDirection: "row",
    justifyContent: "space-between",
    minHeight: MIN_HEIGHT,
    paddingHorizontal: spacing.lg,
  },
});
