import "./App.css";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { Toaster } from "sonner";
import LaunchpadPage from "./pages/LaunchpadPage";
import AdminPage from "./pages/AdminPage";

function App() {
  return (
    <div className="App min-h-screen bg-background text-foreground">
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<LaunchpadPage />} />
          <Route path="/admin" element={<AdminPage />} />
        </Routes>
        <Toaster richColors position="top-right" />
      </BrowserRouter>
    </div>
  );
}

export default App;
