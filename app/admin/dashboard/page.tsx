"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import AdminShell from "../components/admin-shell";
import styles from "../admin-pages.module.css";
import { loadEvents, loadMediaItems } from "../lib/admin-store";
import { fetchEventsApi, fetchMediaItemsApi, fetchStorageStatsApi } from "../lib/admin-api";

function formatGb(bytes: number): string {
  return (bytes / 1024 ** 3).toFixed(2) + " GB";
}

export default function AdminDashboardPage() {
  const [mediaItems, setMediaItems] = useState(loadMediaItems);
  const [events, setEvents] = useState(loadEvents);
  const [audioSizeBytes, setAudioSizeBytes] = useState<number | null>(null);

  useEffect(() => {
    let isActive = true;

    async function hydrateFromApi() {
      try {
        const [apiMedia, apiEvents, storageStats] = await Promise.all([
          fetchMediaItemsApi(),
          fetchEventsApi(),
          fetchStorageStatsApi(),
        ]);

        if (!isActive) {
          return;
        }

        if (apiMedia) setMediaItems(apiMedia);
        if (apiEvents) setEvents(apiEvents);
        if (storageStats) setAudioSizeBytes(storageStats.audioSizeBytes);
      } catch {
        // keep local fallback state
      }
    }

    hydrateFromApi();

    return () => {
      isActive = false;
    };
  }, []);

  const stats = useMemo(() => {
    const videos = mediaItems.filter((item) => item.category === "Videos").length;
    const audios = mediaItems.filter((item) => item.category === "Audio").length;
    const photos = mediaItems.filter((item) => item.category === "Photos").length;
    const totalDownloads = mediaItems.reduce((sum, item) => sum + (Number(item.downloadCount) || 0), 0);
    return {
      videos,
      audios,
      photos,
      totalDownloads,
      events: events.length,
    };
  }, [events.length, mediaItems]);

  const recentUploads = useMemo(() => mediaItems.slice(0, 6), [mediaItems]);

  return (
    <AdminShell title="Dashboard">
      <section className={styles.statsGrid}>
        <article className={styles.statCard}>
          <p className={styles.statLabel}>Videos</p>
          <h3 className={styles.statValue}>{stats.videos}</h3>
        </article>
        <article className={styles.statCard}>
          <p className={styles.statLabel}>Audio</p>
          <h3 className={styles.statValue}>{stats.audios}</h3>
        </article>
        <article className={styles.statCard}>
          <p className={styles.statLabel}>Photos</p>
          <h3 className={styles.statValue}>{stats.photos}</h3>
        </article>
        <article className={styles.statCard}>
          <p className={styles.statLabel}>Total Downloads</p>
          <h3 className={styles.statValue}>{stats.totalDownloads.toLocaleString()}</h3>
        </article>
        <article className={styles.statCard}>
          <p className={styles.statLabel}>Events</p>
          <h3 className={styles.statValue}>{stats.events}</h3>
        </article>
        <article className={styles.statCard}>
          <p className={styles.statLabel}>Audio Storage</p>
          <h3 className={styles.statValue}>
            {audioSizeBytes === null ? "—" : formatGb(audioSizeBytes)}
          </h3>
        </article>
      </section>

      <section className={styles.panel}>
        <h2 className={styles.panelTitle}>Quick Links</h2>
        <p className={styles.panelText}>Jump into common actions for daily admin work.</p>
        <div className={styles.inlineActions}>
          <Link className={styles.linkButton} href="/admin/media-library/new">
            Add New Media
          </Link>
          <Link className={styles.buttonSecondary} href="/admin/media-library/bulk">
            Bulk Add Media
          </Link>
          <Link className={styles.buttonSecondary} href="/admin/events">
            Manage Events
          </Link>
          <Link className={styles.buttonSecondary} href="/admin/blog/new">
            Create New Blog Post
          </Link>
        </div>
      </section>

      <section className={styles.panel}>
        <h2 className={styles.panelTitle}>Recent Uploads</h2>
        {recentUploads.length === 0 ? (
          <p className={styles.emptyState}>No media uploaded yet.</p>
        ) : (
          <div className={styles.tableWrap}>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th>Title</th>
                  <th>Category</th>
                  <th>Speaker</th>
                  <th>Date</th>
                </tr>
              </thead>
              <tbody>
                {recentUploads.map((item) => (
                  <tr key={item.id}>
                    <td>{item.title}</td>
                    <td>{item.category}</td>
                    <td>{item.speaker || "-"}</td>
                    <td>{item.mediaDate ? new Date(item.mediaDate).toLocaleDateString() : "-"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </AdminShell>
  );
}
