import React, { useEffect, useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { azureSilentAuth } from "@/lib/azure-silent-auth";
import { azureSyncService } from "@/lib/azure-sync-service";

type GraphEmail = {
  id: string;
  subject?: string;
  from?: { emailAddress?: { name?: string; address?: string } };
  sender?: { emailAddress?: { name?: string; address?: string } };
  body?: { contentType?: string; content?: string };
  bodyPreview?: string;
  receivedDateTime?: string;
  hasAttachments?: boolean;
  webLink?: string;
};

const TARGET_MAIL =
  (import.meta as any).env?.VITE_MS_TARGET_MAIL || "target@email.com";

const SUBJECT_FILTER = (import.meta as any).env?.VITE_MS_SUBJECT_FILTER || "";

function htmlToText(html: string): string {
  try {
    const doc = new DOMParser().parseFromString(html || "", "text/html");
    // remove styles/scripts and meta/link tags that may contain CSS or external refs
    doc.querySelectorAll("style,script,meta,link").forEach((el) => el.remove());
    const text = doc.body ? doc.body.textContent || "" : "";
    // collapse whitespace and trim
    return text.replace(/\s+/g, " ").trim();
  } catch (e) {
    const div = document.createElement("div");
    div.innerHTML = html || "";
    return (div.textContent || div.innerText || "").replace(/\s+/g, " ").trim();
  }
}

export default function Mails() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [emails, setEmails] = useState<GraphEmail[]>([]);
  const [needsAuth, setNeedsAuth] = useState(false);
  const [authenticating, setAuthenticating] = useState(false);

  const targetUser = useMemo(() => encodeURIComponent(TARGET_MAIL), []);

  useEffect(() => {
    let mounted = true;

    async function init() {
      try {
        setLoading(true);
        setError(null);

        // Handle return from Azure AD if applicable
        await azureSilentAuth.handleAuthReturn();

        // Check if already authenticated
        const isAuth = await azureSilentAuth.isAuthenticated();
        if (!isAuth) {
          // Don't trigger interactive auth automatically; show sign-in CTA
          if (mounted) setNeedsAuth(true);
          return;
        }

        // Authenticated - fetch emails
        const token = await azureSilentAuth.getAccessToken();
        await fetchEmailsWithToken(token, mounted);
      } catch (e: any) {
        if (mounted) setError(e?.message || "Failed to load emails");
      } finally {
        if (mounted) setLoading(false);
      }
    }

    init();
    return () => {
      mounted = false;
    };
  }, [targetUser]);

  async function fetchEmailsWithToken(token: string, mounted = true) {
    setLoading(true);
    setError(null);
    try {
      const url =
        `https://graph.microsoft.com/v1.0/users/${targetUser}/messages` +
        `?$top=25&$orderby=receivedDateTime%20desc&$select=subject,from,sender,body,bodyPreview,receivedDateTime,hasAttachments,webLink`;

      const res = await fetch(url, {
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
      });

      if (!res.ok) {
        throw new Error(`${res.status} ${res.statusText}`);
      }

      const data = await res.json();
      const rawItems: any[] = Array.isArray(data?.value) ? data.value : [];

      // Normalise items into GraphEmail
      const items: GraphEmail[] = rawItems.map((it) => ({
        id: it.id,
        subject: it.subject,
        from: it.from,
        sender: it.sender,
        body: it.body,
        bodyPreview: it.bodyPreview,
        receivedDateTime: it.receivedDateTime,
        hasAttachments: it.hasAttachments,
        webLink: it.webLink,
      }));

      // Apply optional subject filter if provided; otherwise show all
      const filtered = SUBJECT_FILTER
        ? items.filter((m) =>
            (m.subject || "")
              .toLowerCase()
              .includes(SUBJECT_FILTER.toLowerCase()),
          )
        : items;

      const top10 = filtered.slice(0, 10);
      if (mounted) setEmails(top10);
    } catch (e: any) {
      setError(e?.message || "Failed to load emails");
    } finally {
      setLoading(false);
    }
  }

  async function handleSignIn() {
    setAuthenticating(true);
    setError(null);
    try {
      // Try popup-based authentication first (will fallback to redirect if needed)
      const token = await azureSyncService.getAccessToken(false);
      // If token available, fetch emails
      if (token) {
        setNeedsAuth(false);
        await fetchEmailsWithToken(token);
      }
    } catch (e: any) {
      // If redirect-based auth was initiated, the page will reload - show message briefly
      if (
        e?.message &&
        e.message.includes("Redirect authentication initiated")
      ) {
        setError("Redirecting to Microsoft for authentication...");
        return;
      }
      setError(e?.message || "Authentication failed");
    } finally {
      setAuthenticating(false);
    }
  }

  return (
    <div className="p-6">
      <div className="mb-6">
        <h1 className="text-3xl font-bold text-gray-900">Mails</h1>
        <p className="text-gray-600 mt-1">
          Showing latest emails for {decodeURIComponent(targetUser)} containing
          "Invoice" in the subject.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Latest Messages</CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex items-center justify-center py-12 text-gray-600">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-gray-900 mr-3"></div>
              Loading emails...
            </div>
          ) : needsAuth ? (
            <div className="space-y-3">
              <div className="text-gray-700">
                You need to sign in to Microsoft to view mails.
              </div>
              <div>
                <button
                  onClick={handleSignIn}
                  className="px-4 py-2 bg-primary text-white rounded"
                  disabled={authenticating}
                >
                  {authenticating ? "Signing in..." : "Sign in with Microsoft"}
                </button>
              </div>
              {error && <div className="text-red-600">{error}</div>}
            </div>
          ) : error ? (
            <div className="text-red-600">{error}</div>
          ) : emails.length === 0 ? (
            <div className="text-gray-600">No matching emails found.</div>
          ) : (
            <ul className="divide-y divide-gray-200">
              {emails.map((m) => {
                const sender = m.from?.emailAddress;
                const preview = m.bodyPreview || "";
                const contentType = m.body?.contentType || "text";
                const rawContent = m.body?.content || "";
                let bodyText = preview
                  ? preview
                  : contentType.toLowerCase() === "html"
                    ? htmlToText(rawContent)
                    : rawContent;
                bodyText = (bodyText || "").replace(/\s+/g, " ").trim();

                return (
                  <li key={m.id} className="py-4">
                    <div className="mb-1 text-sm text-gray-500">
                      {m.receivedDateTime
                        ? new Date(m.receivedDateTime).toLocaleString()
                        : ""}
                    </div>
                    <div className="font-semibold text-gray-900">
                      {m.subject || "(No subject)"}
                    </div>
                    <div className="text-sm text-gray-700 mb-2">
                      From: {sender?.name || sender?.address || "Unknown"}
                    </div>
                    <div className="text-gray-800 whitespace-pre-wrap break-words">
                      {bodyText}
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
