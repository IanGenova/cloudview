'use client';

import { useMemo, useRef, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import {
  AlertTriangle,
  CheckCircle2,
  Database,
  Download,
  Eye,
  FileArchive,
  HardDriveDownload,
  RefreshCcw,
  RotateCcw,
  ShieldCheck,
  Trash2,
  Upload,
  X,
} from 'lucide-react';
import {
  createBackupAction,
  deleteBackupAction,
  previewBackupAction,
  restoreBackupAction,
  verifyBackupAction,
} from './actions';

type HotelOption = {
  id: string;
  name: string;
  slug: string;
};

type BackupRow = {
  id: string;
  type: string;
  status: string;
  filename: string;
  fileSizeBytes: string;
  checksum: string;
  backupVersion: number;
  schemaVersion: string;
  recordCounts: Record<string, number>;
  errorMessage: string;
  startedAt: string;
  completedAt: string;
  createdAt: string;
  createdBy: string;
};

type RestoreRow = {
  id: string;
  backupFilename: string;
  backupType: string;
  mode: string;
  status: string;
  currentPhase: string;
  errorMessage: string;
  createdAt: string;
  completedAt: string;
  startedBy: string;
  safetyBackupId: string;
};

type PreviewResult = {
  hotelId: string;
  hotelName: string;
  backupType: string;
  createdAt: string;
  schemaVersion: string;
  modules: {
    key: string;
    backupCount: number;
    currentCount: number;
    difference: number;
  }[];
};

type Notice = {
  type: 'success' | 'error';
  text: string;
} | null;

function formatDate(value: string) {
  if (!value) {
    return 'Not available';
  }

  return new Intl.DateTimeFormat('en-PH', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(value));
}

function formatBytes(value: string) {
  const bytes = Number(value || 0);

  if (!Number.isFinite(bytes) || bytes <= 0) {
    return '0 B';
  }

  const units = ['B', 'KB', 'MB', 'GB'];
  const index = Math.min(
    Math.floor(Math.log(bytes) / Math.log(1024)),
    units.length - 1
  );

  return `${(bytes / 1024 ** index).toFixed(index === 0 ? 0 : 1)} ${
    units[index]
  }`;
}

function label(value: string) {
  return value.replaceAll('_', ' ');
}

function statusClass(status: string) {
  if (status === 'VALID' || status === 'RESTORED' || status === 'READY') {
    return 'bg-emerald-100 text-emerald-700';
  }

  if (
    status === 'FAILED' ||
    status === 'CORRUPTED' ||
    status === 'DELETED'
  ) {
    return 'bg-red-100 text-red-700';
  }

  if (
    status === 'CREATING' ||
    status === 'VERIFYING' ||
    status === 'RESTORING'
  ) {
    return 'bg-blue-100 text-blue-700';
  }

  return 'bg-amber-100 text-amber-800';
}

function NoticeBox({
  notice,
  onClose,
}: {
  notice: Notice;
  onClose: () => void;
}) {
  if (!notice) {
    return null;
  }

  return (
    <div
      className={
        notice.type === 'success'
          ? 'mb-5 flex items-start gap-3 rounded-3xl border border-emerald-200 bg-emerald-50 p-4 text-emerald-800'
          : 'mb-5 flex items-start gap-3 rounded-3xl border border-red-200 bg-red-50 p-4 text-red-800'
      }
    >
      {notice.type === 'success' ? (
        <CheckCircle2 className="mt-0.5 size-5 shrink-0" />
      ) : (
        <AlertTriangle className="mt-0.5 size-5 shrink-0" />
      )}

      <p className="min-w-0 flex-1 text-sm font-bold leading-6">
        {notice.text}
      </p>

      <button
        type="button"
        onClick={onClose}
        className="grid size-8 shrink-0 place-items-center rounded-full bg-white/70"
        aria-label="Close message"
      >
        <X className="size-4" />
      </button>
    </div>
  );
}

export function BackupManagerClient({
  isSuperAdmin,
  hotels,
  selectedHotelId,
  backups,
  restores,
}: {
  isSuperAdmin: boolean;
  hotels: HotelOption[];
  selectedHotelId: string;
  backups: BackupRow[];
  restores: RestoreRow[];
}) {
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [pending, startTransition] = useTransition();

  const [backupType, setBackupType] = useState<
    'FULL_HOTEL' | 'CONFIGURATION'
  >('FULL_HOTEL');
  const [notice, setNotice] = useState<Notice>(null);
  const [preview, setPreview] = useState<PreviewResult | null>(null);
  const [restoreBackup, setRestoreBackup] = useState<BackupRow | null>(null);
  const [confirmation, setConfirmation] = useState('');

  const selectedHotel = hotels.find(
    (hotel) => hotel.id === selectedHotelId
  );

  const summary = useMemo(() => {
    const valid = backups.filter((backup) => backup.status === 'VALID').length;
    const failed = backups.filter((backup) =>
      ['FAILED', 'CORRUPTED'].includes(backup.status)
    ).length;
    const bytes = backups.reduce(
      (sum, backup) => sum + Number(backup.fileSizeBytes || 0),
      0
    );

    return {
      total: backups.length,
      valid,
      failed,
      bytes,
    };
  }, [backups]);

  function refreshPage() {
    router.refresh();
  }

  function run(
    operation: () => Promise<
      | { ok: true; message?: string; [key: string]: unknown }
      | { ok: false; error: string }
    >
  ) {
    setNotice(null);

    startTransition(async () => {
      const result = await operation();

      if (!result.ok) {
        setNotice({
          type: 'error',
          text: result.error,
        });
        return;
      }

      setNotice({
        type: 'success',
        text: result.message || 'Operation completed successfully.',
      });
      refreshPage();
    });
  }

  function createBackup() {
    const formData = new FormData();
    formData.set('hotelId', selectedHotelId);
    formData.set('type', backupType);

    run(() => createBackupAction(formData));
  }

  function verifyBackup(backupId: string) {
    const formData = new FormData();
    formData.set('backupId', backupId);

    run(() => verifyBackupAction(formData));
  }

  function loadPreview(backupId: string) {
    const formData = new FormData();
    formData.set('backupId', backupId);
    setNotice(null);

    startTransition(async () => {
      const result = await previewBackupAction(formData);

      if (!result.ok) {
        setNotice({
          type: 'error',
          text: result.error,
        });
        return;
      }

      setPreview(result.preview);
      refreshPage();
    });
  }

  function deleteBackup(backupId: string) {
    if (
      !window.confirm(
        'Delete this backup file? This action cannot be undone.'
      )
    ) {
      return;
    }

    const formData = new FormData();
    formData.set('backupId', backupId);

    run(() => deleteBackupAction(formData));
  }

  function restoreSelectedBackup() {
    if (!restoreBackup) {
      return;
    }

    const formData = new FormData();
    formData.set('backupId', restoreBackup.id);
    formData.set('confirmation', confirmation);

    setNotice(null);

    startTransition(async () => {
      const result = await restoreBackupAction(formData);

      if (!result.ok) {
        setNotice({
          type: 'error',
          text: result.error,
        });
        return;
      }

      setRestoreBackup(null);
      setConfirmation('');
      setNotice({
        type: 'success',
        text: result.message,
      });
      refreshPage();
    });
  }

  async function uploadBackup(file: File) {
    setNotice(null);

    const formData = new FormData();
    formData.set('hotelId', selectedHotelId);
    formData.set('file', file);

    try {
      const response = await fetch('/api/backups/upload', {
        method: 'POST',
        body: formData,
      });
      const result = (await response.json()) as {
        ok?: boolean;
        error?: string;
      };

      if (!response.ok || !result.ok) {
        throw new Error(result.error || 'Backup upload failed.');
      }

      setNotice({
        type: 'success',
        text: 'Backup uploaded and verified.',
      });
      refreshPage();
    } catch (error) {
      setNotice({
        type: 'error',
        text:
          error instanceof Error
            ? error.message
            : 'Backup upload failed.',
      });
    } finally {
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  }

  return (
    <>
      <NoticeBox notice={notice} onClose={() => setNotice(null)} />

      <section className="overflow-hidden rounded-[2rem] border border-neutral-200 bg-white shadow-sm">
        <div className="bg-[radial-gradient(circle_at_top_right,rgba(184,137,56,0.26),transparent_38%),linear-gradient(145deg,#18150e,#090908)] p-6 text-white">
          <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <p className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/10 px-4 py-2 text-[11px] font-black uppercase tracking-[0.2em] text-[#f1c66a]">
                <ShieldCheck className="size-4" />
                Backup Health
              </p>
              <h2 className="mt-5 text-3xl font-black">
                {selectedHotel?.name || 'Select a hotel'}
              </h2>
              <p className="mt-2 max-w-2xl text-sm font-semibold leading-6 text-white/60">
                Backups are created as verified ZIP archives with module
                manifests and SHA-256 checksums.
              </p>
            </div>

            <button
              type="button"
              onClick={refreshPage}
              disabled={pending}
              className="inline-flex h-11 items-center justify-center gap-2 rounded-2xl border border-white/15 bg-white/10 px-5 text-sm font-black text-white hover:bg-white/15 disabled:opacity-50"
            >
              <RefreshCcw className="size-4" />
              Refresh
            </button>
          </div>
        </div>

        <div className="grid gap-3 p-4 sm:grid-cols-2 xl:grid-cols-4">
          <div className="rounded-3xl border border-neutral-200 bg-neutral-50 p-5">
            <p className="text-xs font-black uppercase tracking-wide text-neutral-400">
              Stored Backups
            </p>
            <p className="mt-2 text-3xl font-black">{summary.total}</p>
          </div>
          <div className="rounded-3xl border border-emerald-200 bg-emerald-50 p-5">
            <p className="text-xs font-black uppercase tracking-wide text-emerald-600">
              Valid
            </p>
            <p className="mt-2 text-3xl font-black text-emerald-900">
              {summary.valid}
            </p>
          </div>
          <div className="rounded-3xl border border-red-200 bg-red-50 p-5">
            <p className="text-xs font-black uppercase tracking-wide text-red-600">
              Needs Review
            </p>
            <p className="mt-2 text-3xl font-black text-red-900">
              {summary.failed}
            </p>
          </div>
          <div className="rounded-3xl border border-blue-200 bg-blue-50 p-5">
            <p className="text-xs font-black uppercase tracking-wide text-blue-600">
              Total Size
            </p>
            <p className="mt-2 text-3xl font-black text-blue-950">
              {formatBytes(String(summary.bytes))}
            </p>
          </div>
        </div>
      </section>

      <section className="mt-6 grid gap-5 xl:grid-cols-2">
        <div className="rounded-[2rem] border border-neutral-200 bg-white p-6 shadow-sm">
          <div className="flex items-start gap-4">
            <span className="grid size-12 shrink-0 place-items-center rounded-2xl bg-[#fff5dc] text-[#b88938]">
              <Database className="size-5" />
            </span>
            <div>
              <h3 className="text-xl font-black">Create Backup</h3>
              <p className="mt-1 text-sm font-semibold leading-6 text-neutral-500">
                Full backups include configuration and operational history.
                Configuration backups contain reusable hotel setup.
              </p>
            </div>
          </div>

          {isSuperAdmin ? (
            <label className="mt-5 grid gap-2">
              <span className="text-xs font-black uppercase text-neutral-500">
                Hotel
              </span>
              <select
                value={selectedHotelId}
                onChange={(event) => {
                  router.push(
                    `/dashboard/settings/backups?hotelId=${encodeURIComponent(
                      event.target.value
                    )}`
                  );
                }}
                className="h-12 rounded-2xl border border-neutral-200 bg-white px-4 text-sm font-bold"
              >
                {hotels.map((hotel) => (
                  <option key={hotel.id} value={hotel.id}>
                    {hotel.name}
                  </option>
                ))}
              </select>
            </label>
          ) : null}

          <label className="mt-4 grid gap-2">
            <span className="text-xs font-black uppercase text-neutral-500">
              Backup Type
            </span>
            <select
              value={backupType}
              onChange={(event) =>
                setBackupType(
                  event.target.value as 'FULL_HOTEL' | 'CONFIGURATION'
                )
              }
              className="h-12 rounded-2xl border border-neutral-200 bg-white px-4 text-sm font-bold"
            >
              <option value="FULL_HOTEL">Full Hotel Backup</option>
              <option value="CONFIGURATION">Configuration Backup</option>
            </select>
          </label>

          <button
            type="button"
            onClick={createBackup}
            disabled={pending || !selectedHotelId}
            className="mt-5 inline-flex h-12 w-full items-center justify-center gap-2 rounded-2xl bg-black text-sm font-black text-white hover:bg-neutral-800 disabled:opacity-50"
          >
            <HardDriveDownload className="size-4" />
            {pending ? 'Working...' : 'Create and Verify Backup'}
          </button>
        </div>

        <div className="rounded-[2rem] border border-neutral-200 bg-white p-6 shadow-sm">
          <div className="flex items-start gap-4">
            <span className="grid size-12 shrink-0 place-items-center rounded-2xl bg-blue-50 text-blue-700">
              <Upload className="size-5" />
            </span>
            <div>
              <h3 className="text-xl font-black">Upload Existing Backup</h3>
              <p className="mt-1 text-sm font-semibold leading-6 text-neutral-500">
                Uploaded archives are validated before they are registered.
                Files belonging to another hotel are rejected.
              </p>
            </div>
          </div>

          <input
            ref={fileInputRef}
            type="file"
            accept=".zip,application/zip"
            className="mt-5 block w-full rounded-2xl border border-dashed border-neutral-300 bg-neutral-50 p-4 text-sm font-bold"
            onChange={(event) => {
              const file = event.target.files?.[0];

              if (file) {
                void uploadBackup(file);
              }
            }}
          />

          <div className="mt-4 rounded-2xl bg-amber-50 p-4 text-sm font-bold leading-6 text-amber-800">
            Authentication secrets, NFC access tokens, active device tokens,
            private scan secrets, and integration secrets are intentionally not
            included.
          </div>
        </div>
      </section>

      <section className="mt-6 rounded-[2rem] border border-neutral-200 bg-white p-5 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-xs font-black uppercase tracking-[0.18em] text-[#b88938]">
              Backup History
            </p>
            <h3 className="mt-1 text-xl font-black">Stored Archives</h3>
          </div>
          <span className="rounded-full bg-neutral-100 px-4 py-2 text-xs font-black text-neutral-600">
            Newest first
          </span>
        </div>

        <div className="mt-5 space-y-3">
          {backups.map((backup) => {
            const totalRecords = Object.values(backup.recordCounts).reduce(
              (sum, count) => sum + Number(count || 0),
              0
            );
            const canRestore =
              backup.status === 'VALID' &&
              ['FULL_HOTEL', 'PRE_RESTORE'].includes(backup.type);

            return (
              <article
                key={backup.id}
                className="rounded-[1.5rem] border border-neutral-200 bg-neutral-50 p-4"
              >
                <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <FileArchive className="size-5 text-[#b88938]" />
                      <h4 className="break-all text-base font-black">
                        {backup.filename || 'Backup is being prepared'}
                      </h4>
                      <span
                        className={`rounded-full px-3 py-1 text-[10px] font-black ${statusClass(
                          backup.status
                        )}`}
                      >
                        {label(backup.status)}
                      </span>
                    </div>

                    <p className="mt-2 text-xs font-bold text-neutral-500">
                      {label(backup.type)} · {formatBytes(backup.fileSizeBytes)} ·{' '}
                      {totalRecords.toLocaleString()} exported rows
                    </p>
                    <p className="mt-1 text-xs font-semibold text-neutral-400">
                      Created {formatDate(backup.createdAt)} by{' '}
                      {backup.createdBy}
                    </p>

                    {backup.checksum ? (
                      <p className="mt-2 truncate font-mono text-[10px] text-neutral-400">
                        SHA-256: {backup.checksum}
                      </p>
                    ) : null}

                    {backup.errorMessage ? (
                      <p className="mt-3 rounded-xl bg-red-100 p-3 text-xs font-bold leading-5 text-red-700">
                        {backup.errorMessage}
                      </p>
                    ) : null}
                  </div>

                  <div className="flex flex-wrap gap-2">
                    {backup.status === 'VALID' ? (
                      <a
                        href={`/api/backups/${backup.id}/download`}
                        className="inline-flex h-10 items-center gap-2 rounded-xl bg-black px-4 text-xs font-black text-white hover:bg-neutral-800"
                      >
                        <Download className="size-3.5" />
                        Download
                      </a>
                    ) : null}

                    <button
                      type="button"
                      onClick={() => verifyBackup(backup.id)}
                      disabled={pending}
                      className="inline-flex h-10 items-center gap-2 rounded-xl border border-neutral-200 bg-white px-4 text-xs font-black hover:bg-neutral-50 disabled:opacity-50"
                    >
                      <ShieldCheck className="size-3.5" />
                      Verify
                    </button>

                    <button
                      type="button"
                      onClick={() => loadPreview(backup.id)}
                      disabled={pending || backup.status !== 'VALID'}
                      className="inline-flex h-10 items-center gap-2 rounded-xl border border-neutral-200 bg-white px-4 text-xs font-black hover:bg-neutral-50 disabled:opacity-50"
                    >
                      <Eye className="size-3.5" />
                      Preview
                    </button>

                    <button
                      type="button"
                      onClick={() => {
                        setRestoreBackup(backup);
                        setConfirmation('');
                      }}
                      disabled={!canRestore || pending}
                      title={
                        canRestore
                          ? undefined
                          : 'Only valid full backups can run a full restore.'
                      }
                      className="inline-flex h-10 items-center gap-2 rounded-xl bg-amber-500 px-4 text-xs font-black text-black hover:bg-amber-400 disabled:opacity-40"
                    >
                      <RotateCcw className="size-3.5" />
                      Restore
                    </button>

                    <button
                      type="button"
                      onClick={() => deleteBackup(backup.id)}
                      disabled={pending}
                      className="inline-flex h-10 items-center gap-2 rounded-xl bg-red-600 px-4 text-xs font-black text-white hover:bg-red-700 disabled:opacity-50"
                    >
                      <Trash2 className="size-3.5" />
                      Delete
                    </button>
                  </div>
                </div>
              </article>
            );
          })}

          {!backups.length ? (
            <div className="rounded-[1.5rem] border border-dashed border-neutral-300 bg-neutral-50 p-10 text-center">
              <FileArchive className="mx-auto size-10 text-neutral-300" />
              <p className="mt-4 font-black">No backups yet.</p>
              <p className="mt-1 text-sm font-semibold text-neutral-500">
                Create the first full hotel backup above.
              </p>
            </div>
          ) : null}
        </div>
      </section>

      <section className="mt-6 rounded-[2rem] border border-neutral-200 bg-white p-5 shadow-sm">
        <p className="text-xs font-black uppercase tracking-[0.18em] text-[#b88938]">
          Restore History
        </p>
        <h3 className="mt-1 text-xl font-black">Recovery Activity</h3>

        <div className="mt-4 overflow-x-auto">
          <table className="min-w-full text-left text-sm">
            <thead>
              <tr className="border-b border-neutral-200 text-xs uppercase text-neutral-400">
                <th className="px-3 py-3">Backup</th>
                <th className="px-3 py-3">Mode</th>
                <th className="px-3 py-3">Status</th>
                <th className="px-3 py-3">Phase</th>
                <th className="px-3 py-3">Started By</th>
                <th className="px-3 py-3">Date</th>
              </tr>
            </thead>
            <tbody>
              {restores.map((restore) => (
                <tr key={restore.id} className="border-b border-neutral-100">
                  <td className="px-3 py-3 font-bold">
                    {restore.backupFilename}
                  </td>
                  <td className="px-3 py-3">{label(restore.mode)}</td>
                  <td className="px-3 py-3">
                    <span
                      className={`rounded-full px-3 py-1 text-[10px] font-black ${statusClass(
                        restore.status
                      )}`}
                    >
                      {label(restore.status)}
                    </span>
                  </td>
                  <td className="px-3 py-3 text-neutral-500">
                    {restore.currentPhase || '—'}
                    {restore.errorMessage ? (
                      <p className="mt-1 max-w-sm text-xs font-bold text-red-600">
                        {restore.errorMessage}
                      </p>
                    ) : null}
                  </td>
                  <td className="px-3 py-3">{restore.startedBy}</td>
                  <td className="px-3 py-3 text-neutral-500">
                    {formatDate(restore.createdAt)}
                  </td>
                </tr>
              ))}

              {!restores.length ? (
                <tr>
                  <td
                    colSpan={6}
                    className="px-3 py-8 text-center font-semibold text-neutral-400"
                  >
                    No restore activity yet.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </section>

      {preview ? (
        <div className="fixed inset-0 z-[100] grid place-items-center bg-black/60 p-4">
          <div className="max-h-[92vh] w-full max-w-4xl overflow-y-auto rounded-[2rem] bg-white p-6 shadow-2xl">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-xs font-black uppercase tracking-[0.18em] text-[#b88938]">
                  Restore Preview
                </p>
                <h2 className="mt-1 text-2xl font-black">
                  {preview.hotelName}
                </h2>
                <p className="mt-1 text-sm font-semibold text-neutral-500">
                  {label(preview.backupType)} · {formatDate(preview.createdAt)}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setPreview(null)}
                className="grid size-10 place-items-center rounded-full bg-neutral-100"
              >
                <X className="size-5" />
              </button>
            </div>

            <div className="mt-5 overflow-x-auto">
              <table className="min-w-full text-left text-sm">
                <thead>
                  <tr className="border-b border-neutral-200 text-xs uppercase text-neutral-400">
                    <th className="px-3 py-3">Dataset</th>
                    <th className="px-3 py-3">Current</th>
                    <th className="px-3 py-3">Backup</th>
                    <th className="px-3 py-3">Difference</th>
                  </tr>
                </thead>
                <tbody>
                  {preview.modules.map((item) => (
                    <tr key={item.key} className="border-b border-neutral-100">
                      <td className="px-3 py-3 font-bold">
                        {label(item.key.replace('.', ' / '))}
                      </td>
                      <td className="px-3 py-3">{item.currentCount}</td>
                      <td className="px-3 py-3">{item.backupCount}</td>
                      <td
                        className={
                          item.difference === 0
                            ? 'px-3 py-3 text-neutral-400'
                            : item.difference > 0
                              ? 'px-3 py-3 font-black text-emerald-700'
                              : 'px-3 py-3 font-black text-red-700'
                        }
                      >
                        {item.difference > 0 ? '+' : ''}
                        {item.difference}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      ) : null}

      {restoreBackup ? (
        <div className="fixed inset-0 z-[110] grid place-items-center bg-black/65 p-4">
          <div className="w-full max-w-xl rounded-[2rem] bg-white p-6 shadow-2xl">
            <div className="flex items-start gap-4">
              <span className="grid size-12 shrink-0 place-items-center rounded-2xl bg-red-100 text-red-700">
                <AlertTriangle className="size-5" />
              </span>
              <div>
                <h2 className="text-xl font-black">Confirm Full Restore</h2>
                <p className="mt-1 text-sm font-semibold leading-6 text-neutral-500">
                  Current hotel data will be replaced by{' '}
                  <b>{restoreBackup.filename}</b>. CloudView creates a safety
                  backup automatically before removing current data.
                </p>
              </div>
            </div>

            <div className="mt-5 rounded-2xl bg-amber-50 p-4 text-sm font-bold leading-6 text-amber-900">
              Active browser sessions, device authorizations, NFC access
              sessions, and stay passcodes are not restored. Restored active
              stays are marked expired for safety.
            </div>

            <label className="mt-5 grid gap-2">
              <span className="text-xs font-black uppercase text-neutral-500">
                Type RESTORE to continue
              </span>
              <input
                value={confirmation}
                onChange={(event) => setConfirmation(event.target.value)}
                className="h-12 rounded-2xl border border-neutral-200 px-4 text-sm font-black outline-none focus:border-red-400 focus:ring-4 focus:ring-red-100"
                placeholder="RESTORE"
              />
            </label>

            <div className="mt-5 grid grid-cols-2 gap-3">
              <button
                type="button"
                onClick={() => {
                  setRestoreBackup(null);
                  setConfirmation('');
                }}
                className="h-12 rounded-2xl border border-neutral-200 bg-white text-sm font-black"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={restoreSelectedBackup}
                disabled={pending || confirmation !== 'RESTORE'}
                className="h-12 rounded-2xl bg-red-600 text-sm font-black text-white hover:bg-red-700 disabled:opacity-40"
              >
                {pending ? 'Restoring...' : 'Restore Data'}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
