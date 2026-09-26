import { ActionMenu, type Frame } from "@native/design";
import { Camera, Images } from "lucide-react-native";
import { CHAT_COPY } from "./copy";

const MENU_GAP = 8;
// The composer sits on the keyboard, so there is never room below the paperclip: #23 opens the
// menu above it. Reserving the whole window makes ActionMenu take that branch every time.
const ABOVE_ALWAYS = Number.POSITIVE_INFINITY;

const noop = () => undefined;

/**
 * #23's paperclip menu, drawn with both items disabled and a "Coming soon" caption (designed;
 * docs/spec/phase-12.md §4.4 W8). Photo attachments are out of scope, and a paperclip that only
 * toasted was inert in practice: the toast drew under the keyboard (docs/parity/REPORT.md, W8).
 */
export function AttachMenu({
  anchor,
  onClose,
}: {
  readonly anchor: Frame | null;
  readonly onClose: () => void;
}) {
  return (
    <ActionMenu
      anchor={anchor ? { align: "left", frame: anchor, gap: MENU_GAP } : null}
      caption={CHAT_COPY.attachMenu.comingSoon}
      entries={[
        {
          disabled: true,
          icon: Images,
          label: CHAT_COPY.attachMenu.library,
          onPress: noop,
          testID: "chat-attach-menu-library",
        },
        {
          disabled: true,
          icon: Camera,
          label: CHAT_COPY.attachMenu.camera,
          onPress: noop,
          testID: "chat-attach-menu-camera",
        },
      ]}
      // Inline, as the model menu is: the composer's keyboard stays up under it, as in #23.
      inline
      onClose={onClose}
      reserveBottom={ABOVE_ALWAYS}
      testID="chat-attach-menu"
      wrapLabels
    />
  );
}
