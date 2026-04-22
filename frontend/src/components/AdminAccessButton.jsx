import { Settings2 } from "lucide-react";

export const AdminAccessButton = ({ onClick }) => {
  return (
    <button
      type="button"
      onClick={onClick}
      className="fixed bottom-6 left-6 z-50 rounded-full border border-slate-200 bg-white/90 p-3 text-slate-500 shadow-lg transition-all duration-200 hover:-translate-y-0.5 hover:text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-600 focus:ring-offset-2"
      data-testid="admin-toggle"
      aria-label="Otevřít správu"
    >
      <Settings2 className="h-5 w-5" />
    </button>
  );
};