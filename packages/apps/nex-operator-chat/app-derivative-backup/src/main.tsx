import React from "react";
import ReactDOM from "react-dom/client";
import { NexChatApp } from "./NexChatApp";
import "./index.css";

document.title = "Nex Operator Chat";

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <NexChatApp />
  </React.StrictMode>,
);
