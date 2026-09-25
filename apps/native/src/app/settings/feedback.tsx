import { SupportForm } from "@native/features/settings/SupportForm";

// The bug form's designed sibling (docs/spec/phase-10.md §3.9), in place of discovery's mailto.
export default function FeedbackSheet() {
  return <SupportForm variant="feedback" />;
}
