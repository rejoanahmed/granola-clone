import type { ReactNode } from "react";
import { Text as NativeText, type TextProps } from "react-native";
import { MAX_FONT_SCALE, type TypeVariant, typography } from "./tokens";

type Props = Omit<TextProps, "children"> & {
  readonly children: ReactNode;
  readonly color?: string;
  readonly variant: TypeVariant;
};

export function Text({ children, color, style, variant, ...rest }: Props) {
  return (
    <NativeText
      maxFontSizeMultiplier={MAX_FONT_SCALE}
      style={[typography[variant], color ? { color } : null, style]}
      {...rest}
    >
      {children}
    </NativeText>
  );
}
