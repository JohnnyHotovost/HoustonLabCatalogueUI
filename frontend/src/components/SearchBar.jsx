import { Lock, LockOpen, Search } from "lucide-react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "./ui/select";
import { Input } from "./ui/input";

export const SearchBar = ({
  value,
  onChange,
  sortMode,
  onSortChange,
  showCustomLock = false,
  customUnlocked = false,
  onToggleCustomLock,
  customLockDisabled = false,
  showCustomReset = false,
  onResetCustomOrder,
}) => {
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

        <div className="flex w-full gap-3 md:w-auto">
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

          {showCustomLock ? (
            <button
              type="button"
              onClick={onToggleCustomLock}
              disabled={customLockDisabled}
              className={`inline-flex h-16 w-16 items-center justify-center rounded-[1.25rem] border-2 text-slate-600 shadow-sm transition-all ${
                customUnlocked ? "border-blue-200 bg-blue-50 text-blue-700" : "border-slate-200 bg-white"
              }`}
              data-testid="custom-order-lock-toggle"
              aria-label={customUnlocked ? "Zamknout vlastní pořadí" : "Odemknout vlastní pořadí"}
            >
              {customUnlocked ? <LockOpen className="h-5 w-5" /> : <Lock className="h-5 w-5" />}
            </button>
          ) : null}

          {showCustomReset ? (
            <button
              type="button"
              onClick={onResetCustomOrder}
              className="inline-flex h-16 items-center justify-center rounded-[1.25rem] border-2 border-slate-200 bg-white px-4 text-sm font-medium text-slate-500 shadow-sm transition-colors hover:text-slate-900"
              data-testid="custom-order-reset-button"
            >
              Reset
            </button>
          ) : null}
        </div>
      </div>
    </div>
  );
};