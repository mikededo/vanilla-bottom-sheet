import { createRoot } from "react-dom/client";
import { BottomSheet } from "./component";

const container = document.getElementById("root");
if (container) {
  const root = createRoot(container);
  root.render(<BottomSheet />);
}
