import { createRoot } from "react-dom/client";
import App from "../web-app/app/App.tsx";
import "./styles/index.css";

createRoot(document.getElementById("root")!).render(<App />);
