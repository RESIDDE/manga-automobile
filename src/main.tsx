import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import { AuthProvider } from "./hooks/useAuth.tsx";
import "./index.css";
import { registerServiceWorker } from "./lib/pwa";

registerServiceWorker();

createRoot(document.getElementById("root")!).render(
  <AuthProvider>
    <App />
  </AuthProvider>
);
