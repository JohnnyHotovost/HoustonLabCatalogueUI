import { Settings2 } from "lucide-react";

export const AdminAccessButton = ({ onClick }) => (
  <button type="button" onClick={onClick} className="admin-access" data-testid="admin-toggle" aria-label="Otevřít správu">
    <Settings2 className="h-4 w-4" aria-hidden="true" /><span>Správa rozcestníku</span>
  </button>
);
