import React, { useState, useEffect, useRef, useMemo } from "react";
import {
  Play,
  Square,
  Clock,
  History,
  Plus,
  AlertCircle,
  Keyboard,
  Timer,
  X,
  ArrowRight,
  Save,
  Moon,
  Calendar
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { API_BASE, cls } from "@/lib/api";
import GlobalLoader from "@/components/ui/GlobalLoader";

// --- HELPERS ---
const formatDuration = (seconds: number) => {
  if (!seconds && seconds !== 0) return "—";
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  // Show "0h 45m" style for history, standard colon for timer
  return `${hours}h ${minutes}m`;
};

// Precise formatter for the big timer (HH:MM:SS)
const formatTimer = (seconds: number) => {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const remainingSeconds = seconds % 60;
  return `${hours.toString().padStart(2, "0")}:${minutes
    .toString()
    .padStart(2, "0")}:${remainingSeconds.toString().padStart(2, "0")}`;
};

const formatTime = (isoString: string) =>
  new Date(isoString).toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit"
  });

// We use this to group.
const getDateKey = (isoString: string) =>
  new Date(isoString).toLocaleDateString([], {
    weekday: "short",
    month: "short",
    day: "numeric"
  });

// Check if shift spans across midnight
const spansMidnight = (startIso: string, endIso?: string) => {
  if (!endIso) return false;
  const start = new Date(startIso);
  const end = new Date(endIso);
  return start.getDate() !== end.getDate();
};

// --- TYPES ---
type ManualBlock = {
  id: string;
  date: string;
  start: string;
  end: string;
  notes: string;
};

// --- MAIN COMPONENT ---
export default function TimeTracking() {
  const [user] = useState(() => {
    try {
      return JSON.parse(localStorage.getItem("synergy_user") || "{}");
    } catch {
      return {};
    }
  });

  const [status, setStatus] = useState<any>(null);
  const [history, setHistory] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [elapsed, setElapsed] = useState(0);

  // Manual Entry Modal State
  const [manualOpen, setManualOpen] = useState(false);
  const [blocks, setBlocks] = useState<ManualBlock[]>([
    {
      id: "1",
      date: new Date().toISOString().split("T")[0],
      start: "",
      end: "",
      notes: ""
    }
  ]);

  // Notes editing state for existing history entries
  const [editingEntryId, setEditingEntryId] = useState<string | null>(null);
  const [editingEntryNotes, setEditingEntryNotes] = useState<string>("");
  const [editingEntry, setEditingEntry] = useState<any>(null); // Track the full object being edited

  const timerRef = useRef<NodeJS.Timeout | null>(null);

  // Initial Load
  useEffect(() => {
    fetchData();
    return () => stopTimer();
  }, []);

  // Timer Logic
  useEffect(() => {
    if (status?.active_session) {
      const startTime = new Date(status.active_session.clock_in).getTime();
      const tick = () => {
        const now = new Date().getTime();
        setElapsed(Math.floor((now - startTime) / 1000));
      };
      tick();
      timerRef.current = setInterval(tick, 1000);
    } else {
      stopTimer();
      setElapsed(0);
    }
    return () => stopTimer();
  }, [status?.active_session]);

  const stopTimer = () => {
    if (timerRef.current) clearInterval(timerRef.current);
  };

  const fetchData = async () => {
    setLoading(true);
    try {
      const headers = { "X-User-ID": String(user.id) };
      const [statusResponse, historyResponse] = await Promise.all([
        fetch(`${API_BASE}/time/status`, { headers }),
        fetch(`${API_BASE}/time/history?limit=100`, { headers }) // Increased limit for better grouping
      ]);

      if (statusResponse.ok) setStatus(await statusResponse.json());
      if (historyResponse.ok) setHistory(await historyResponse.json());
    } catch (error) {
      console.error(error);
    } finally {
      setLoading(false);
    }
  };

  const handleClockIn = async () => {
    try {
      await fetch(`${API_BASE}/time/clock-in`, {
        method: "POST",
        headers: { "X-User-ID": String(user.id) }
      });
      fetchData();
    } catch (error) {
      alert("Failed to clock in");
    }
  };

  const handleClockOut = async () => {
    try {
      const response = await fetch(`${API_BASE}/time/clock-out`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json", // Required by backend
          "X-User-ID": String(user.id)
        },
        body: JSON.stringify({}) // Required: Send empty JSON to satisfy Body() parameter
      });

      if (!response.ok) {
        const responseBody = await response.json();
        throw new Error(responseBody.detail || "Clock out failed");
      }

      fetchData();
    } catch (error) {
      console.error(error);
      alert("Failed to clock out. Please check console.");
    }
  };

  // --- NOTES EDITING FOR EXISTING ENTRIES ---

const startEditing = (entry: any) => {
  const toDTLocal = (iso: string) => {
    if (!iso) return "";
    const d = new Date(iso);
    const pad = (num: number) => String(num).padStart(2, "0");
    
    const date = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
    const time = `${pad(d.getHours())}:${pad(d.getMinutes())}`;
    return `${date}T${time}`;
  };

  setEditingEntry({
    ...entry,
    clock_in: toDTLocal(entry.clock_in),
    clock_out: toDTLocal(entry.clock_out),
    notes: entry.notes || ""
  });
};

const saveEdit = async () => {
  try {
    setLoading(true);
    
    // Convert the local input strings back to UTC ISO strings for the backend
    const payload = {
      clock_in: new Date(editingEntry.clock_in).toISOString(),
      clock_out: editingEntry.clock_out 
        ? new Date(editingEntry.clock_out).toISOString() 
        : null,
      notes: editingEntry.notes
    };

    const response = await fetch(`${API_BASE}/time/entry/${editingEntry.id}`, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        "X-User-ID": String(user.id)
      },
      body: JSON.stringify(payload)
    });

    if (!response.ok) throw new Error("Failed to save");
    
    setEditingEntry(null);
    fetchData();
  } catch (error) {
    alert("Error updating entry. Ensure end time is after start time.");
  } finally {
    setLoading(false);
  }
};

  const cancelEditingEntryNotes = () => {
    setEditingEntryId(null);
    setEditingEntryNotes("");
  };

  const saveEditingEntryNotes = async (entryId: string) => {
    try {
      setLoading(true);
      const response = await fetch(
        `${API_BASE}/time/entry/${entryId}/notes`,
        {
          method: "PATCH",
          headers: {
            "Content-Type": "application/json",
            "X-User-ID": String(user.id)
          },
          body: JSON.stringify({ notes: editingEntryNotes })
        }
      );

      if (!response.ok) {
        let errorMessage = "Failed to update notes.";
        try {
          const body = await response.json();
          if (body && body.detail) {
            errorMessage = body.detail;
          }
        } catch {
          // Ignore parse errors and keep generic message
        }
        throw new Error(errorMessage);
      }

      cancelEditingEntryNotes();
      fetchData();
    } catch (error) {
      console.error(error);
      alert("Failed to save notes. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  // --- CLIENT-SIDE CALCULATION FOR TODAY'S TOTAL ---
  // This fixes the issue where server time (UTC) differs from your local time
  const todayTotalSeconds = useMemo(() => {
    const todayString = new Date().toDateString(); // Local "Today" string (e.g. "Tue Dec 09 2025")

    // 1. Sum up completed history items that started TODAY (Local Time)
    const historySum = history.reduce((accumulator, entry) => {
      const entryDateString = new Date(entry.clock_in).toDateString();
      if (entryDateString === todayString) {
        return accumulator + (entry.duration_seconds || 0);
      }
      return accumulator;
    }, 0);

    // 2. Add current active session if it started TODAY
    let activeSum = 0;
    if (status?.active_session) {
      const activeDateString = new Date(
        status.active_session.clock_in
      ).toDateString();
      if (activeDateString === todayString) {
        activeSum = elapsed;
      }
    }

    return historySum + activeSum;
  }, [history, elapsed, status?.active_session]);

  // --- MANUAL BLOCK LOGIC ---
  const addBlock = () => {
    const lastDate =
      blocks.length > 0
        ? blocks[blocks.length - 1].date
        : new Date().toISOString().split("T")[0];
    setBlocks([
      ...blocks,
      {
        id: Math.random().toString(),
        date: lastDate,
        start: "",
        end: "",
        notes: ""
      }
    ]);
  };

  const removeBlock = (id: string) => {
    setBlocks(blocks.filter((block) => block.id !== id));
  };

  const updateBlock = (
    id: string,
    field: keyof ManualBlock,
    value: string
  ) => {
    setBlocks(
      blocks.map((block) =>
        block.id === id ? { ...block, [field]: value } : block
      )
    );
  };

  const calculatePreview = () => {
    let totalSeconds = 0;
    const validBlocks: any[] = [];

    for (const block of blocks) {
      if (!block.start || !block.end || !block.date) continue;

      const startIso = new Date(`${block.date}T${block.start}`);
      let endIso = new Date(`${block.date}T${block.end}`);

      // Handle Overnight
      let overnight = false;
      if (endIso < startIso) {
        endIso.setDate(endIso.getDate() + 1);
        overnight = true;
      }

      const duration = (endIso.getTime() - startIso.getTime()) / 1000;
      if (duration > 0) {
        totalSeconds += duration;
        validBlocks.push({
          ...block,
          startIso,
          endIso,
          overnight,
          duration
        });
      }
    }
    return { totalSecs: totalSeconds, validBlocks };
  };

  const submitManualEntries = async () => {
    const { validBlocks } = calculatePreview();
    if (validBlocks.length === 0)
      return alert("Please enter valid times.");

    const payload = validBlocks.map((block) => ({
      clock_in: block.startIso.toISOString(),
      clock_out: block.endIso.toISOString(),
      notes: block.notes
    }));

    try {
      setLoading(true);
      const response = await fetch(`${API_BASE}/time/manual/bulk`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-User-ID": String(user.id)
        },
        body: JSON.stringify(payload)
      });
      if (!response.ok) throw new Error();
      setManualOpen(false);
      setBlocks([
        {
          id: "1",
          date: new Date().toISOString().split("T")[0],
          start: "",
          end: "",
          notes: ""
        }
      ]);
      fetchData();
    } catch (error) {
      alert("Failed to save entries.");
    } finally {
      setLoading(false);
    }
  };

  // --- GROUPING LOGIC ---
  const groupedHistory = useMemo(() => {
    const groups: Record<string, { totalSeconds: number; entries: any[] }> = {};

    history.forEach((entry) => {
      // Group by Start Date (Local)
      const dateKey = getDateKey(entry.clock_in);
      if (!groups[dateKey]) {
        groups[dateKey] = { totalSeconds: 0, entries: [] };
      }
      groups[dateKey].entries.push(entry);
      if (entry.duration_seconds) {
        groups[dateKey].totalSeconds += entry.duration_seconds;
      }
    });

    return Object.entries(groups).sort((a, b) => {
      // Sort by date descending (newest groups first)
      const dateA = new Date(a[1].entries[0].clock_in).getTime();
      const dateB = new Date(b[1].entries[0].clock_in).getTime();
      return dateB - dateA;
    });
  }, [history]);

  const previewData = calculatePreview();
  const isActive = !!status?.active_session;

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-[#020617] text-slate-900 dark:text-gray-100 font-sans p-4 md:p-8">
      <GlobalLoader loading={loading} label="Syncing..." />

      <div className="max-w-5xl mx-auto space-y-6">
        {/* HEADER */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
              <Clock className="h-6 w-6 text-primary" />
              Time Tracking
            </h1>
            <p className="text-muted-foreground text-sm mt-1">
              Track your shifts, breaks, and manual hours.
            </p>
          </div>
          <div className="flex items-center gap-4 bg-white dark:bg-slate-900 p-3 rounded-xl border shadow-sm">
            <div className="text-right">
              <div className="text-[10px] font-bold uppercase text-muted-foreground tracking-wider">
                Today&apos;s Total
              </div>
              <div className="text-xl font-mono font-bold text-emerald-600 dark:text-emerald-400">
                {formatTimer(todayTotalSeconds)}
              </div>
            </div>
            <div className="h-8 w-px bg-border" />
            <Button
              variant="outline"
              size="sm"
              onClick={() => setManualOpen(true)}
            >
              <Plus className="h-4 w-4 mr-2" />
              Add Manual Time
            </Button>
          </div>
        </div>

        {/* CLOCK IN/OUT CARD */}
        <div
          className={cls(
            "relative overflow-hidden rounded-2xl border bg-card p-6 md:p-10 shadow-sm transition-all",
            isActive
              ? "border-emerald-500/50 shadow-emerald-500/10"
              : "border-border"
          )}
        >
          {isActive && (
            <div className="absolute inset-0 bg-emerald-500/5 animate-pulse pointer-events-none" />
          )}

          <div className="relative z-10 flex flex-col md:flex-row items-center justify-between gap-8 text-center md:text-left">
            <div className="flex flex-col gap-2">
              <div className="flex items-center justify-center md:justify-start gap-2">
                <span
                  className={cls(
                    "flex h-3 w-3 rounded-full",
                    isActive ? "bg-emerald-500 animate-pulse" : "bg-slate-300"
                  )}
                />
                <span className="text-sm font-medium uppercase tracking-wide text-muted-foreground">
                  {isActive ? "Currently Working" : "Ready to Start"}
                </span>
              </div>
              <div className="text-6xl md:text-8xl font-mono font-bold tracking-tighter tabular-nums">
                {formatTimer(elapsed)}
              </div>
              {isActive && (
                <div className="text-sm text-muted-foreground">
                  Started at {formatTime(status.active_session.clock_in)}
                </div>
              )}
            </div>

            <div>
              {!isActive ? (
                <button
                  onClick={handleClockIn}
                  className="group flex h-32 w-32 md:h-40 md:w-40 items-center justify-center rounded-full bg-emerald-600 text-white shadow-xl transition-all hover:scale-105 hover:bg-emerald-500 active:scale-95"
                >
                  <div className="flex flex-col items-center gap-1">
                    <Play className="h-10 w-10 fill-current" />
                    <span className="text-sm font-bold uppercase tracking-wider">
                      Clock In
                    </span>
                  </div>
                </button>
              ) : (
                <button
                  onClick={handleClockOut}
                  className="group flex h-32 w-32 md:h-40 md:w-40 items-center justify-center rounded-full bg-rose-600 text-white shadow-xl transition-all hover:scale-105 hover:bg-rose-500 active:scale-95"
                >
                  <div className="flex flex-col items-center gap-1">
                    <Square className="h-10 w-10 fill-current" />
                    <span className="text-sm font-bold uppercase tracking-wider">
                      Clock Out
                    </span>
                  </div>
                </button>
              )}
            </div>
          </div>
        </div>

        {/* HISTORY GROUPED LIST */}
        <div className="space-y-4">
          <h2 className="text-lg font-semibold flex items-center gap-2">
            <History className="h-5 w-5" /> Recent Shifts
          </h2>

          <div className="space-y-6">
            {groupedHistory.map(([dateKey, group]) => (
              <div
                key={dateKey}
                className="rounded-xl border bg-card overflow-hidden shadow-sm"
              >
                {/* GROUP HEADER: DATE + TOTAL */}
                <div className="bg-muted/40 px-4 py-3 flex justify-between items-center border-b">
                  <div className="flex items-center gap-2 font-semibold text-sm">
                    <Calendar className="h-4 w-4 text-muted-foreground" />
                    {dateKey}
                  </div>
                  <div className="flex items-center gap-2 text-sm">
                    <span className="text-muted-foreground uppercase text-[10px] font-bold tracking-wider">
                      Daily Total
                    </span>
                    <span className="font-mono font-bold text-foreground">
                      {formatDuration(group.totalSeconds)}
                    </span>
                  </div>
                </div>

                {/* ENTRIES FOR THIS DATE */}
                <div className="divide-y divide-border">
                 {group.entries.map((entry: any) => {
  const isEditing = editingEntry?.id === entry.id;
  const isOvernight = spansMidnight(entry.clock_in, entry.clock_out);

  return (
    <div key={entry.id} className="p-4 border-b last:border-0 hover:bg-muted/10">
      {isEditing ? (
        // EDIT MODE UI
        <div className="space-y-4 bg-muted/30 p-4 rounded-lg">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-1">
              <Label className="text-xs">Clock In</Label>
              <Input 
                type="datetime-local" 
                value={editingEntry.clock_in} 
                onChange={e => setEditingEntry({...editingEntry, clock_in: e.target.value})}
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Clock Out</Label>
              <Input 
                type="datetime-local" 
                value={editingEntry.clock_out} 
                onChange={e => setEditingEntry({...editingEntry, clock_out: e.target.value})}
              />
            </div>
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Notes</Label>
            <Textarea 
              value={editingEntry.notes} 
              onChange={e => setEditingEntry({...editingEntry, notes: e.target.value})}
              placeholder="What were you working on?"
            />
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="outline" size="sm" onClick={() => setEditingEntry(null)}>Cancel</Button>
            <Button size="sm" onClick={saveEdit}><Save className="h-4 w-4 mr-2"/> Update Entry</Button>
          </div>
        </div>
      ) : (
        // VIEW MODE UI (Your existing UI with an "Edit" trigger)
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
          <div className="flex items-center gap-4">
            <div className="min-w-[140px] font-medium text-sm">
              {formatTime(entry.clock_in)} → {entry.clock_out ? formatTime(entry.clock_out) : "Active"}
              {isOvernight && <span className="ml-2 text-[10px] bg-indigo-100 text-indigo-700 px-1.5 py-0.5 rounded">+1 Day</span>}
            </div>
            <div className="text-sm font-mono text-muted-foreground">
              {formatDuration(entry.duration_seconds)}
            </div>
          </div>
          
          <div className="flex items-center gap-4 flex-1 justify-end">
            <button 
              onClick={() => startEditing(entry)}
              className="text-sm text-muted-foreground italic hover:text-primary text-right"
            >
              {entry.notes || "Add notes..."}
            </button>
            <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => startEditing(entry)}>
              <Clock className="h-4 w-4" />
            </Button>
          </div>
        </div>
      )}
    </div>
  );
})}
                </div>
              </div>
            ))}

            {groupedHistory.length === 0 && (
              <div className="p-8 text-center text-muted-foreground border rounded-xl border-dashed">
                No time entries found.
              </div>
            )}
          </div>
        </div>
      </div>

      {/* --- MANUAL ENTRY MODAL --- */}
      {manualOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm overflow-y-auto">
          <div className="w-full max-w-2xl bg-card border rounded-xl shadow-2xl animate-in fade-in zoom-in-95 flex flex-col max-h-[90vh]">
            <div className="px-6 py-4 border-b flex justify-between items-center bg-muted/20">
              <div>
                <h3 className="text-lg font-bold flex items-center gap-2">
                  <Plus className="h-5 w-5 text-primary" /> Log Hours
                </h3>
                <p className="text-xs text-muted-foreground">
                  Add multiple segments (e.g. before &amp; after lunch)
                </p>
              </div>
              <div className="text-right">
                <div className="text-[10px] uppercase text-muted-foreground font-bold">
                  Total Duration
                </div>
                <div className="text-lg font-mono font-bold text-primary">
                  {formatDuration(previewData.totalSecs)}
                </div>
              </div>
            </div>

            <div className="p-6 overflow-y-auto space-y-4 flex-1">
              {blocks.map((block) => {
                const startIso =
                  block.date && block.start
                    ? new Date(`${block.date}T${block.start}`)
                    : null;
                const endIso =
                  block.date && block.end
                    ? new Date(`${block.date}T${block.end}`)
                    : null;
                const isOvernight =
                  startIso && endIso && endIso < startIso;

                return (
                  <div
                    key={block.id}
                    className="group relative grid grid-cols-1 md:grid-cols-12 gap-3 items-start p-3 rounded-lg border bg-muted/10 hover:bg-muted/30 transition-colors"
                  >
                    <button
                      onClick={() => removeBlock(block.id)}
                      className="absolute -top-2 -right-2 md:top-3 md:-right-3 md:opacity-0 md:group-hover:opacity-100 bg-destructive text-white p-1 rounded-full shadow-sm hover:scale-110 transition-all z-10"
                      title="Remove row"
                    >
                      <X className="h-3 w-3" />
                    </button>

                    <div className="md:col-span-3 space-y-1">
                      <Label className="text-xs text-muted-foreground">
                        Date
                      </Label>
                      <Input
                        type="date"
                        value={block.date}
                        onChange={(event) =>
                          updateBlock(block.id, "date", event.target.value)
                        }
                        className="h-9"
                      />
                    </div>

                    <div className="md:col-span-2 space-y-1">
                      <Label className="text-xs text-muted-foreground">
                        Start
                      </Label>
                      <Input
                        type="time"
                        value={block.start}
                        onChange={(event) =>
                          updateBlock(block.id, "start", event.target.value)
                        }
                        className="h-9"
                      />
                    </div>

                    <div className="md:col-span-1 flex items-center justify-center pt-6 text-muted-foreground">
                      <ArrowRight className="h-4 w-4" />
                    </div>

                    <div className="md:col-span-2 space-y-1 relative">
                      <Label className="text-xs text-muted-foreground">
                        End
                      </Label>
                      <Input
                        type="time"
                        value={block.end}
                        onChange={(event) =>
                          updateBlock(block.id, "end", event.target.value)
                        }
                        className={cls(
                          "h-9",
                          isOvernight &&
                            "border-indigo-300 ring-1 ring-indigo-100"
                        )}
                      />
                      {isOvernight && (
                        <div className="absolute -bottom-5 left-0 text-[10px] font-bold text-indigo-600 flex items-center gap-1 animate-in fade-in">
                          <Moon className="h-3 w-3" /> +1 Day
                        </div>
                      )}
                    </div>

                    <div className="md:col-span-4 space-y-1">
                      <Label className="text-xs text-muted-foreground">
                        Notes
                      </Label>
                      <Input
                        placeholder="Project or task..."
                        value={block.notes}
                        onChange={(event) =>
                          updateBlock(block.id, "notes", event.target.value)
                        }
                        className="h-9"
                      />
                    </div>
                  </div>
                );
              })}

              <Button
                variant="outline"
                size="sm"
                onClick={addBlock}
                className="w-full border-dashed text-muted-foreground hover:text-foreground"
              >
                <Plus className="h-4 w-4 mr-2" /> Add Another Time Block
              </Button>
            </div>

            <div className="p-4 border-t bg-muted/20 flex justify-between items-center gap-4">
              <div className="text-xs text-muted-foreground flex items-center gap-2">
                <AlertCircle className="h-4 w-4 shrink-0" />
                <span>
                  Marked as <strong>Manual</strong>.
                </span>
              </div>
              <div className="flex gap-2">
                <Button
                  variant="ghost"
                  onClick={() => setManualOpen(false)}
                >
                  Cancel
                </Button>
                <Button
                  onClick={submitManualEntries}
                  disabled={previewData.validBlocks.length === 0}
                  className="min-w-[120px]"
                >
                  <Save className="h-4 w-4 mr-2" /> Save Logs
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
