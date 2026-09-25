// Every Ask string the app draws itself (docs/spec/phase-7.md §4). The chips and placeholders are
// not here: they live in `@gc/domain/Domain/Chat`, so the fake, the tests and the app read one list.
export const CHAT_COPY = {
  activity: {
    doneA11y: "All tool activity complete",
    loaded: "Loaded notes",
    searched: "Searched notes",
    searching: "Searching notes...",
    title: "Activity",
    toolNames: { open: "Read meetings", search: "List meetings" },
  },
  answer: {
    copied: "Copied to clipboard",
    copy: "Copy response",
    down: "Send negative feedback",
    failed: "Couldn’t answer that.",
    retry: "Retry",
    thinking: "Thinking...",
    up: "Send positive feedback",
  },
  citation: {
    loadFailed: "Couldn’t load the note.",
    retry: "Retry",
    unavailable: "This note is no longer available.",
  },
  composer: {
    attach: "Add attachment",
    model: (label: string) => `Chat model: ${label}`,
  },
  greeting: {
    fallback: "Ask anything",
    named: (firstName: string) => `Hi ${firstName}, ask anything`,
  },
  history: {
    close: "Close chat history",
    delete: "Delete",
    emptyBody: "Your conversations with Notes will appear here.",
    emptyTitle: "No chats yet",
    loadFailed: "Couldn’t load your chats.",
    noResults: "No results",
    noResultsFor: (q: string) => `for “${q}”`,
    pin: "Pin",
    retry: "Retry",
    search: "Search",
    sections: {
      older: "Older",
      pinned: "Pinned",
      today: "Today",
      week: "Previous 7 days",
      yesterday: "Yesterday",
    },
    title: "Chat History",
    unpin: "Unpin",
  },
  nav: {
    back: "Back",
    close: "Close",
    history: "Chat history",
    newChat: "New chat",
  },
  thread: {
    gone: "This chat no longer exists.",
    loadFailed: "Couldn’t load this chat.",
    retry: "Retry",
  },
  toasts: {
    attachments: "Attachments aren’t available yet.",
    deleted: "Chat deleted",
    deleteFailed: "Couldn’t delete the chat. Try again.",
    dictation: "Dictation isn’t available yet.",
    feedbackFailed: "Couldn’t save feedback. Try again.",
    modelFailed: "Couldn’t change the model. Try again.",
    updateFailed: "Couldn’t update the chat. Try again.",
  },
} as const;

export const noteResults = (n: number): string => {
  if (n === 0) {
    return "No note results";
  }
  return n === 1 ? "1 note result" : `${n} note results`;
};

export const openedMeetings = (n: number): string =>
  n === 1 ? "Opened 1 meeting" : `Opened ${n} meetings`;
