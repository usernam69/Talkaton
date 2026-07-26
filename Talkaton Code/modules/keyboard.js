export function isMessageSubmitKey(event) {
  return event.key === "Enter" && !event.shiftKey && !event.isComposing;
}
