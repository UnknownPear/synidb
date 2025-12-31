'use client';

import { useEffect, useRef } from 'react';
import { useToast } from '@/components/ui/use-toast';
import { API_BASE } from '@/lib/api';
import { CustomLoader } from '@/components/ui/CustomLoader';
import { CheckCircle, AlertTriangle } from 'lucide-react';

/**
 * A global, "headless" component that listens for server-sent events (SSE)
 * and displays system-wide notifications (toasts). Includes detailed console logs for debugging.
 */
export function GlobalEventListener() {
  const { toast } = useToast();
  const backupToastId = useRef<string | null>(null);

  useEffect(() => {
    // Log when the component mounts and starts its logic
    console.log('[SSE] GlobalEventListener mounted. Attempting to connect...');

    const eventSource = new EventSource(`${API_BASE}/events`);

    // --- Connection Status Handlers ---
    eventSource.onopen = () => {
      console.log('[SSE] Connection to /events opened successfully!');
    };

    eventSource.onerror = (error) => {
      // This will fire if the connection fails entirely (e.g., CORS error, 404)
      console.error('[SSE] Connection error:', error);
      eventSource.close(); // Close the connection on a fatal error
    };

    // --- Event Handler for Backup Start ---
    const handleBackupStart = (event: MessageEvent) => {
      // THIS IS A CRITICAL LOG. If you don't see this, the event never arrived.
      console.log('[SSE] Received "backup.started" event! Data:', event.data);
      
      const data = JSON.parse(event.data);
      
      if (backupToastId.current) {
        console.log('[SSE] A backup toast is already active. Ignoring new "started" event.');
        return;
      }

      console.log('[SSE] Creating a new "in-progress" toast.');
      const { id } = toast({
        title: (
          <div className="flex items-center gap-3">
            <CustomLoader size={0.25} />
            <span className="font-semibold">System Maintenance</span>
          </div>
        ),
        description: data.message || 'Database backup in progress...',
        duration: Infinity,
      });
      backupToastId.current = id;
    };

    // --- Event Handler for Backup Finish ---
    const handleBackupFinish = (event: MessageEvent) => {
      console.log('[SSE] Received "backup.finished" event! Data:', event.data);

      if (!backupToastId.current) {
        console.warn('[SSE] Received "finished" event, but no active toast to update.');
        return;
      }
      
      const data = JSON.parse(event.data);
      
      console.log(`[SSE] Updating toast ID ${backupToastId.current} to "success" state.`);
      toast.update(backupToastId.current, {
        title: (
          <div className="flex items-center gap-3">
            <CheckCircle className="h-6 w-6 text-green-500" />
            <span className="font-semibold">System Maintenance</span>
          </div>
        ),
        description: data.message || 'Database backup complete.',
        duration: 5000,
      });

      backupToastId.current = null;
    };
    
    // --- Event Handler for Backup Failure ---
    const handleBackupFailed = (event: MessageEvent) => {
      console.log('[SSE] Received "backup.failed" event! Data:', event.data);

      if (!backupToastId.current) {
        console.warn('[SSE] Received "failed" event, but no active toast to update.');
        return;
      }

      const data = JSON.parse(event.data);

      console.log(`[SSE] Updating toast ID ${backupToastId.current} to "destructive" state.`);
      toast.update(backupToastId.current, {
        variant: 'destructive',
        title: (
          <div className="flex items-center gap-3">
            <AlertTriangle className="h-6 w-6" />
            <span className="font-semibold">Backup Failed</span>
          </div>
        ),
        description: data.message || 'The scheduled backup failed. Please check logs.',
        duration: 15000,
      });

      backupToastId.current = null;
    };

    // Attach the handlers to specific event types from the server.
    eventSource.addEventListener('backup.started', handleBackupStart);
    eventSource.addEventListener('backup.finished', handleBackupFinish);
    eventSource.addEventListener('backup.failed', handleBackupFailed);

    // This cleanup function runs when the component unmounts.
    return () => {
      console.log('[SSE] Closing connection to /events as component unmounts.');
      eventSource.removeEventListener('backup.started', handleBackupStart);
      eventSource.removeEventListener('backup.finished', handleBackupFinish);
      eventSource.removeEventListener('backup.failed', handleBackupFailed);
      eventSource.close();
    };
  }, [toast]); // The effect re-runs only if the toast function itself changes (rare).

  return null; // This component renders no visible UI.
}