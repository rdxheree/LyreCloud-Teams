import { createRoot } from "react-dom/client";
import App from "./App";
import "./index.css";
import { FileProvider } from "./contexts/FileContext";

createRoot(document.getElementById("root")!).render(
  <FileProvider>
    <App />
  </FileProvider>
);
