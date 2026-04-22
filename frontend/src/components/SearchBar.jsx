import { Search } from "lucide-react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "./ui/select";
import { Input } from "./ui/input";

export const SearchBar = ({ value, onChange, sortMode, onSortChange }) => {
  return (
    <div className="panel-surface mx-auto w-full max-w-5xl p-4 md:p-5" data-testid="search-wrapper">
      <div className="flex flex-col gap-3 md:flex-row md:items-center">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-5 top-1/2 h-6 w-6 -translate-y-1/2 text-slate-400" />
          <Input
            value={value}
            onChange={(event) => onChange(event.target.value)}
            className="h-16 rounded-[1.25rem] border-2 border-slate-200 bg-white pl-14 pr-5 text-lg shadow-sm transition-colors focus:border-blue-600 focus:ring-0"
            data-testid="search-input"
            placeholder="Najdi katalog nebo web podle názvu"
          />
        </div>

        <div className="w-full md:w-[240px]">
          <Select value={sortMode} onValueChange={onSortChange}>
            <SelectTrigger className="h-16 rounded-[1.25rem] border-2 border-slate-200 bg-white px-5 text-base shadow-sm" data-testid="search-sort-select">
              <SelectValue placeholder="Řazení" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="alphabetical">A–Z</SelectItem>
              <SelectItem value="clicks">Nejnavštěvovanější</SelectItem>
              <SelectItem value="latest">Nejnovější</SelectItem>
              <SelectItem value="custom">Vlastní pořadí</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>
    </div>
  );
};