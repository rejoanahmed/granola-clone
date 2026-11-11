import type {
  deleteChatRoute,
  getChatRoute,
  listChatModelsRoute,
  listChatsRoute,
  patchChatRoute,
  putChatFeedbackRoute,
  putChatModelRoute,
} from "@kn/domain/Chats/Contract";
import type { Endpoint } from "./client";

// `import type` only, as in `notes.ts`. The three streaming routes are not here: their body is SSE,
// not JSON, so they go through `askChat` in `chatStream.ts`, which takes the fetch as a parameter
// because React Native's global one cannot stream a body.
export const makeChatsApi = (endpoint: Endpoint) => ({
  deleteChat: endpoint<typeof deleteChatRoute>("delete", "/chats/{id}"),
  getChat: endpoint<typeof getChatRoute>("get", "/chats/{id}"),
  listChatModels: endpoint<typeof listChatModelsRoute>("get", "/chat/models"),
  listChats: endpoint<typeof listChatsRoute>("get", "/chats"),
  putChatFeedback: endpoint<typeof putChatFeedbackRoute>(
    "put",
    "/chats/{id}/messages/{messageId}/feedback"
  ),
  selectChatModel: endpoint<typeof putChatModelRoute>("put", "/chat/model"),
  updateChat: endpoint<typeof patchChatRoute>("patch", "/chats/{id}"),
});
