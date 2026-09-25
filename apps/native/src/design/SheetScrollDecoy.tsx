import { ScrollView, StyleSheet } from "react-native";

/**
 * react-native-screens resizes the first ScrollView it finds in a formSheet to the whole sheet
 * (RNSScreen `applyFrameCorrectionForDescendantScrollView`), which drags a list that sits under a
 * header up over it. A sheet whose scroller cannot be its root (Chat History's list has a docked
 * search under it, the Activity timeline a fixed header over it) renders this empty, inert one as
 * its first child, so the correction lands here and the real list keeps its frame
 * (docs/plan/BLOCKERS.md, "Sheets with a scroller").
 */
export function SheetScrollDecoy() {
  return (
    <ScrollView
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      pointerEvents="none"
      scrollEnabled={false}
      style={StyleSheet.absoluteFill}
    />
  );
}
