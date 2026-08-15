import { Route, Routes } from "react-router-dom";
import { AppHeader } from "./components/AppHeader";
import { ToastRegion } from "./components/ToastRegion";
import { CheckInPage } from "./pages/CheckInPage";
import { EventPage } from "./pages/EventPage";
import { HostEventPage } from "./pages/HostEventPage";
import { HowItWorksPage } from "./pages/HowItWorksPage";
import { MyRsvpsPage } from "./pages/MyRsvpsPage";
import { PassPage } from "./pages/PassPage";
import { SystemStatusPage } from "./pages/SystemStatusPage";

export default function App() {
  return (
    <div className="app-shell">
      <AppHeader />
      <main>
        <Routes>
          <Route path="/" element={<EventPage />} />
          <Route path="/events/demo" element={<EventPage />} />
          <Route path="/events/demo/pass" element={<PassPage />} />
          <Route path="/my-rsvps" element={<MyRsvpsPage />} />
          <Route path="/host" element={<HostEventPage />} />
          <Route path="/host/demo/check-in" element={<CheckInPage />} />
          <Route path="/how-it-works" element={<HowItWorksPage />} />
          <Route path="/status" element={<SystemStatusPage />} />
          <Route path="*" element={<EventPage />} />
        </Routes>
      </main>
      <ToastRegion />
    </div>
  );
}
