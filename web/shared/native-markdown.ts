import { renderMarkdown } from "./markdown";
declare global {
  interface Window {
    renderNote: (text: string) => void;
  }
}
window.renderNote = (text) => {
  document.getElementById("content")!.innerHTML = renderMarkdown(text);
};
