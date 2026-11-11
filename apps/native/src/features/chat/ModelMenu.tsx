import type {
  ChatModel,
  ChatModelFamily,
  ChatModelId,
} from "@kn/domain/Domain/Chat";
import { ActionMenu, type MenuAnchor } from "@native/design";
import {
  BookOpen,
  Gem,
  type LucideIcon,
  Scale,
  WandSparkles,
  Zap,
} from "lucide-react-native";

// One neutral glyph per family: the fake list has no vendors, so none of #22's logos apply.
const FAMILY_GLYPH: Record<ChatModelFamily, LucideIcon> = {
  auto: WandSparkles,
  balanced: Scale,
  classic: BookOpen,
  premium: Gem,
  swift: Zap,
};

type Props = {
  readonly anchor: MenuAnchor | null;
  readonly models: readonly ChatModel[];
  readonly onClose: () => void;
  readonly onPick: (id: ChatModelId) => void;
  readonly selected: ChatModelId;
};

/** #22: the model list in server order (Auto last), the selected one checked, a disabled one greyed. */
export function ModelMenu({
  anchor,
  models,
  onClose,
  onPick,
  selected,
}: Props) {
  return (
    <ActionMenu
      anchor={anchor}
      checkable
      entries={models.map((model) => ({
        checked: model.id === selected,
        disabled: !model.enabled,
        icon: FAMILY_GLYPH[model.family],
        label: model.label,
        onPress: () => onPick(model.id),
        testID: `chat-model-${model.id}`,
      }))}
      inline
      onClose={onClose}
      testID="chat-model-menu"
    />
  );
}
