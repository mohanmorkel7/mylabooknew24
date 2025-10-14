import React, { useEffect, useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { azureSilentAuth } from "@/lib/azure-silent-auth";

type GraphEmail = {
  id: string;
  subject: string;
  from?: { emailAddress?: { name?: string; address?: string } };
  body?: { contentType?: string; content?: string };
  receivedDateTime?: string;
};

const TARGET_MAIL =
  (import.meta as any).env?.VITE_MS_TARGET_MAIL || "target@email.com";

function htmlToText(html: string): string {
  const div = document.createElement("div");
  div.innerHTML = html;
  return div.textContent || div.innerText || "";
}

export default function Mails() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [emails, setEmails] = useState<GraphEmail[]>([]);

  const targetUser = useMemo(() => encodeURIComponent(TARGET_MAIL), []);

  useEffect(() => {
    let mounted = true;

    async function init() {
      try {
        setLoading(true);
        setError(null);

        // Handle auth redirect if coming back from Microsoft login
        await azureSilentAuth.handleAuthReturn();
        const token = await azureSilentAuth.getAccessToken();

        // Fetch latest messages and filter client-side by subject contains "Invoice"
        // We fetch more than 10 to ensure enough results after filtering
        const url =
          `https://graph.microsoft.com/v1.0/users/${targetUser}/messages` +
          `?$top=25&$orderby=receivedDateTime%20desc&$select=subject,from,body,receivedDateTime`;

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
        const items: GraphEmail[] = Array.isArray(data?.value) ? data.value : [];

        const filtered = items.filter((m) =>
          (m.subject || "").toLowerCase().includes("invoice")
        );

        const top10 = filtered.slice(0, 10);
        if (mounted) setEmails(top10);
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
          ) : error ? (
            <div className="text-red-600">{error}</div>
          ) : emails.length === 0 ? (
            <div className="text-gray-600">No matching emails found.</div>
          ) : (
            <ul className="divide-y divide-gray-200">
              {emails.map((m) => {
                const sender = m.from?.emailAddress;
                const contentType = m.body?.contentType || "text";
                const rawContent = m.body?.content || "";
                const bodyText =
                  contentType.toLowerCase() === "html"
                    ? htmlToText(rawContent)
                    : rawContent;

                return (
                  <li key={m.id} className="py-4">
                    <div className="mb-1 text-sm text-gray-500">
                      {m.receivedDateTime ? new Date(m.receivedDateTime).toLocaleString() : ""}
                    </div>
                    <div className="font-semibold text-gray-900">{m.subject || "(No subject)"}</div>
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
