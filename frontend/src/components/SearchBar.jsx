import { Search } from "lucide-react";
import { Input } from "./ui/input";

export const SearchBar = ({ value, onChange }) => {
  return (
    <div className="mx-auto w-full max-w-2xl" data-testid="search-wrapper">
      <div className="relative">
        <Search className="pointer-events-none absolute left-5 top-1/2 h-6 w-6 -translate-y-1/2 text-slate-400" />
        <Input
          value={value}
          onChange={(event) => onChange(event.target.value)}
          className="h-16 rounded-[1.25rem] border-2 border-slate-200 bg-white pl-14 pr-5 text-lg shadow-sm transition-colors focus:border-blue-600 focus:ring-0"
          data-testid="search-input"
          placeholder="Najdi katalog nebo web podle názvu"
        />
      </div>
    </div>
  );
};