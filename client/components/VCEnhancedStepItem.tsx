import React, { useEffect, useMemo, useRef, useState } from "react";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { useNavigate } from "react-router-dom";
import { RichTextEditor } from "./RichTextEditor";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  CheckCircle,
  Clock,
  ChevronDown,
  ChevronRight,
  FileText,
  Download,
  MessageCircle,
  Upload,
  Send,
  Trash2,
  GripVertical,
  Reply,
  Paperclip,
  X,
  Bold,
  Italic,
  Link,
  AlignLeft,
  List,
  Image,
  Eye,
  Edit,
} from "lucide-react";
import { useAuth } from "@/lib/auth-context";
import { useCreateFollowUp, useUsers } from "@/hooks/useApi";
import { apiClient } from "@/lib/api";
import { formatToISTDateTime } from "@/lib/dateUtils";

interface VCEnhancedStepItemProps {
  step: any;
  isExpanded: boolean;
  onToggleExpansion: () => void;
  onUpdateStatus: (stepId: number, status: string) => void;
  onDeleteStep: (stepId: number) => void;
  isDragOverlay?: boolean;
  stepApiBase?: "vc" | "fund-raises";
}

interface ChatMessage {
  id: number;
  user_name: string;
  user_id?: number;
  message: string;
  is_rich_text: boolean;
  message_type: "text" | "file" | "system";
  created_at: string;
  attachments?: any[];
}

export function VCEnhancedStepItem({
  step,
  isExpanded,
  onToggleExpansion,
  onUpdateStatus,
  onDeleteStep,
  isDragOverlay = false,
  stepApiBase = "vc",
}: VCEnhancedStepItemProps) {
  const { user } = useAuth();
  const navigate = useNavigate();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const messagesContainerRef = useRef<HTMLDivElement>(null);
  const { data: users = [], isLoading: usersLoading } = useUsers();

  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: step.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  // Filter active users and format for dropdown
  const teamMembers = users
    .filter((user: any) => user.status === "active")
    .map((user: any) => ({
      id: user.id,
      name: `${user.first_name} ${user.last_name}`,
      role: user.role,
    }));

  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [chatLoading, setChatLoading] = useState<boolean>(false);
  const [chatError, setChatError] = useState<any>(null);

  // Load chats when expanded
  useEffect(() => {
    const loadChats = async () => {
      if (!isExpanded || !step?.id) return;
      try {
        setChatLoading(true);
        setChatError(null);
        const rows = await apiClient.request(
          `/${stepApiBase}/steps/${step.id}/chats`,
        );
        setChatMessages(Array.isArray(rows) ? rows : []);
      } catch (e: any) {
        setChatError(e);
      } finally {
        setChatLoading(false);
      }
    };
    loadChats();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isExpanded, step?.id, stepApiBase]);

  // Sort messages by created_at in ascending order (latest last for bottom scroll)
  const sortedMessages = useMemo(() => {
    return [...chatMessages].sort(
      (a, b) =>
        new Date(a.created_at).getTime() - new Date(b.created_at).getTime(),
    );
  }, [chatMessages]);

  // Auto-scroll to bottom when new messages arrive
  useEffect(() => {
    if (messagesContainerRef.current && sortedMessages.length > 0) {
      messagesContainerRef.current.scrollTop =
        messagesContainerRef.current.scrollHeight;
    }
  }, [sortedMessages]);

  const [newMessage, setNewMessage] = useState("");
  const [stagedAttachments, setStagedAttachments] = useState<any[]>([]);

  // Follow-up related states
  const [createFollowUp, setCreateFollowUp] = useState(false);
  const [followUpNotes, setFollowUpNotes] = useState("");
  const [followUpAssignTo, setFollowUpAssignTo] = useState("");
  const [followUpDueDate, setFollowUpDueDate] = useState(() => {
    // Default to 3 days from now
    const defaultDate = new Date();
    defaultDate.setDate(defaultDate.getDate() + 3);
    return defaultDate.toISOString().split("T")[0];
  });

  // Edit message state
  const [editingMessageId, setEditingMessageId] = useState<number | null>(null);
  const [editMessageText, setEditMessageText] = useState("");

  // Delete confirmation modal state
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [messageToDelete, setMessageToDelete] = useState<number | null>(null);

  const createFollowUpMutation = useCreateFollowUp();

  // Function to highlight mentions and make follow-up IDs clickable
  const processMessageContent = (messageText: string) => {
    if (!user) return messageText;

    let processedText = messageText;

    // Look for mentions of current user (case insensitive)
    const userNamePattern = new RegExp(`@${user.name}`, "gi");
    processedText = processedText.replace(
      userNamePattern,
      `<span class="bg-red-100 text-red-700 px-1 rounded font-medium">@${user.name}</span>`,
    );

    // Make follow-up IDs clickable (#13, #14, etc.)
    const followUpPattern = /#(\d+)/g;
    processedText = processedText.replace(
      followUpPattern,
      `<span class="follow-up-link bg-blue-100 text-blue-700 px-2 py-1 rounded font-medium cursor-pointer hover:bg-blue-200"
        data-follow-up-id="$1"
        onclick="window.location.href='/follow-ups?id=$1'"
      >#$1</span>`,
    );

    return processedText;
  };

  // Don't render if step is invalid
  if (!step || !step.id) {
    return null;
  }

  const handleFileUpload = async (
    event: React.ChangeEvent<HTMLInputElement>,
  ) => {
    const files = event.target.files;
    if (!files || files.length === 0 || !user) return;

    try {
      const result: any = await apiClient.uploadFiles(files);
      const uploaded = Array.isArray(result?.files) ? result.files : [];
      const newAttachments = uploaded.map((f: any) => ({
        file_name: f.originalName || f.filename,
        file_size: f.size,
        file_type: f.mimetype,
        file_path: f.path,
        filename: f.filename,
        download_url: `/api/files/download/${f.filename}`,
      }));
      setStagedAttachments((prev) => [...prev, ...newAttachments]);
    } catch (e) {
      console.error("File upload failed:", e);
      alert("File upload failed. Please try again.");
    } finally {
      event.target.value = "";
    }
  };

  const removeAttachment = (index: number) => {
    setStagedAttachments((prev) => prev.filter((_, i) => i !== index));
  };

  const handleSendMessage = async () => {
    if (!newMessage.trim() && stagedAttachments.length === 0) return;

    try {
      const payload = {
        user_id: parseInt(user?.id || "0"),
        user_name: user?.name || "Anonymous",
        message: newMessage.trim(),
        is_rich_text: true,
        message_type: "text" as const,
        attachments: stagedAttachments,
      };

      const saved = await apiClient.request(
        `/${stepApiBase}/steps/${step.id}/chats`,
        {
          method: "POST",
          body: JSON.stringify(payload),
        },
      );

      setChatMessages((prev) => [...prev, saved]);
      setNewMessage("");
      setStagedAttachments([]);
    } catch (error) {
      console.error("Failed to send message:", error);
      // Fallback to local state
      const fallback: ChatMessage = {
        id: Date.now(),
        user_id: parseInt(user?.id || "0"),
        user_name: user?.name || "Anonymous",
        message: newMessage.trim(),
        is_rich_text: true,
        message_type: "text",
        created_at: new Date().toISOString(),
        attachments: stagedAttachments,
      } as any;
      setChatMessages((prev) => [...prev, fallback]);
      setNewMessage("");
      setStagedAttachments([]);
    }
  };

  const handleFollowUp = (messageId: number) => {
    setCreateFollowUp(true);
  };

  const handleCreateFollowUp = async () => {
    if (!followUpNotes.trim() || !followUpAssignTo || !followUpDueDate) {
      alert("Please fill in all follow-up fields");
      return;
    }

    try {
      // Create the follow-up task
      const created = await createFollowUpMutation.mutateAsync({
        title: `Fund Raise Follow-up: ${step.name}`,
        description: followUpNotes,
        assigned_to: parseInt(followUpAssignTo),
        due_date: followUpDueDate,
        priority: "medium",
        vc_id: step.vc_id,
        vc_step_id: step.id,
        created_by: parseInt(user?.id || "1"),
      });

      const assignee = teamMembers.find(
        (m) => m.id === parseInt(followUpAssignTo),
      );
      const details = [
        created?.id ? `ID: #${created.id}` : null,
        assignee ? `Assignee: ${assignee.name}` : null,
        `Due: ${new Date(followUpDueDate).toLocaleDateString()}`,
      ]
        .filter(Boolean)
        .join(" | ");

      const systemMessageText = `📋 Follow-up created: "${followUpNotes}" — ${details}`;

      try {
        // Use the correct steps chat API endpoint
        const systemMessageResponse = await apiClient.request(
          `/${stepApiBase}/steps/${step.id}/chats`,
          {
            method: "POST",
            body: JSON.stringify({
              user_id: parseInt(user?.id || "1"),
              user_name: "System",
              message: systemMessageText,
              message_type: "system",
              is_rich_text: false,
              attachments: [],
            }),
          },
        );

        // Add to local state if API call successful
        setChatMessages((prev) => [...prev, systemMessageResponse]);
      } catch (messageError) {
        console.error(
          "Failed to save system message to VC chat:",
          messageError,
        );
        // Fallback: add to local state only
        const systemMessage = {
          id: Date.now(),
          message: systemMessageText,
          message_type: "system" as const,
          user_id: parseInt(user?.id || "1"),
          user_name: "System",
          is_rich_text: false,
          created_at: new Date().toISOString(),
        };
        setChatMessages((prev) => [...prev, systemMessage]);
      }

      setCreateFollowUp(false);
      setFollowUpNotes("");
      setFollowUpAssignTo("");
      setFollowUpDueDate("");
    } catch (error) {
      console.error("Failed to create follow-up:", error);
    }
  };

  const handleEditMessage = (
    messageId: number,
    messageText: string,
    isRichText: boolean,
  ) => {
    setEditingMessageId(messageId);
    setEditMessageText(messageText);
  };

  const handleSaveEdit = async (
    messageId: number,
    originalIsRichText: boolean,
  ) => {
    try {
      const saved = await apiClient.request(
        `/${stepApiBase}/chats/${messageId}`,
        {
          method: "PUT",
          body: JSON.stringify({
            message: editMessageText.trim(),
            is_rich_text: true,
          }),
        },
      );

      setChatMessages((prev) =>
        prev.map((msg) => (msg.id === messageId ? { ...msg, ...saved } : msg)),
      );
      setEditingMessageId(null);
      setEditMessageText("");
    } catch (error) {
      console.error("Failed to edit message:", error);
      // Fallback: update locally
      setChatMessages((prev) =>
        prev.map((msg) =>
          msg.id === messageId
            ? {
                ...msg,
                message: editMessageText.trim(),
                is_rich_text: true,
              }
            : msg,
        ),
      );
      setEditingMessageId(null);
      setEditMessageText("");
    }
  };

  const handleCancelEdit = () => {
    setEditingMessageId(null);
    setEditMessageText("");
  };

  const handleDeleteMessage = (messageId: number) => {
    setMessageToDelete(messageId);
    setDeleteConfirmOpen(true);
  };

  const confirmDeleteMessage = async () => {
    if (!messageToDelete) return;

    try {
      await apiClient.request(`/${stepApiBase}/chats/${messageToDelete}`, {
        method: "DELETE",
      });
    } catch (error) {
      console.error("Failed to delete on server, removing locally:", error);
    } finally {
      setChatMessages((prev) =>
        prev.filter((msg) => msg.id !== messageToDelete),
      );
      setDeleteConfirmOpen(false);
      setMessageToDelete(null);
    }
  };

  const cancelDeleteMessage = () => {
    setDeleteConfirmOpen(false);
    setMessageToDelete(null);
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`border rounded-lg bg-white ${isDragOverlay ? "shadow-2xl" : ""}`}
    >
      <Collapsible open={isExpanded} onOpenChange={onToggleExpansion}>
        <div className="flex items-center space-x-4 p-4">
          {/* Drag Handle */}
          <div
            {...attributes}
            {...listeners}
            className="flex-shrink-0 cursor-grab active:cursor-grabbing text-gray-400 hover:text-gray-600"
            title="Drag to reorder"
          >
            <GripVertical className="w-5 h-5" />
          </div>

          {/* Status Icon */}
          <div className="flex-shrink-0">
            {step.status === "completed" ? (
              <CheckCircle className="w-6 h-6 text-green-600" />
            ) : step.status === "in_progress" ? (
              <Clock className="w-6 h-6 text-blue-600" />
            ) : (
              <div className="w-6 h-6 border-2 border-gray-300 rounded-full" />
            )}
          </div>

          <CollapsibleTrigger className="flex-1 flex items-center justify-between text-left">
            <div className="flex-1">
              <div className="flex items-center space-x-2">
                <span className="font-medium text-gray-900">{step.name}</span>
                <div className="flex items-center space-x-2">
                  {typeof step.probability_percent !== "undefined" &&
                    step.probability_percent !== null && (
                      <Badge
                        variant="outline"
                        className="text-xs bg-blue-50 text-blue-700 border-blue-200"
                      >
                        {parseFloat(step.probability_percent) || 0}%
                      </Badge>
                    )}
                  {step.estimated_days && (
                    <Badge variant="outline" className="text-xs">
                      {step.estimated_days}d ETA
                    </Badge>
                  )}
                  {stepApiBase === "vc" && step.priority && (
                    <Badge
                      variant="outline"
                      className={`text-xs ${
                        step.priority === "high"
                          ? "bg-red-50 text-red-700 border-red-200"
                          : step.priority === "medium"
                            ? "bg-yellow-50 text-yellow-700 border-yellow-200"
                            : "bg-green-50 text-green-700 border-green-200"
                      }`}
                    >
                      {step.priority} priority
                    </Badge>
                  )}
                  {(() => {
                    const count =
                      !chatLoading && sortedMessages.length > 0
                        ? sortedMessages.length
                        : step.message_count || 0;
                    return count > 0 ? (
                      <Badge variant="outline" className="text-xs">
                        {count} message{count !== 1 ? "s" : ""}
                      </Badge>
                    ) : null;
                  })()}
                </div>
              </div>
              <div className="text-sm text-gray-600 mt-1">
                {step.description}
              </div>
              <div className="text-sm text-gray-600">
                {step.status === "completed" &&
                  step.completed_date &&
                  `Completed on ${new Date(step.completed_date).toLocaleDateString("en-IN", { timeZone: "Asia/Kolkata" })}`}
                {step.status !== "completed" &&
                  step.due_date &&
                  `Due: ${new Date(step.due_date).toLocaleDateString("en-IN", { timeZone: "Asia/Kolkata" })}`}
              </div>
            </div>
            {isExpanded ? (
              <ChevronDown className="w-4 h-4" />
            ) : (
              <ChevronRight className="w-4 h-4" />
            )}
          </CollapsibleTrigger>

          <div className="flex items-center space-x-2">
            <Select
              value={step.status}
              onValueChange={(value) => onUpdateStatus(step.id, value)}
            >
              <SelectTrigger className="w-32">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="pending">Pending</SelectItem>
                <SelectItem value="in_progress">In Progress</SelectItem>
                <SelectItem value="completed">Completed</SelectItem>
              </SelectContent>
            </Select>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => onDeleteStep(step.id)}
              className="text-red-600 hover:text-red-700"
              title="Delete this step"
            >
              <Trash2 className="w-4 h-4" />
            </Button>
          </div>
        </div>

        <CollapsibleContent>
          <div className="border-t bg-gray-50">
            <div className="p-4">
              {/* Full Chat Functionality for All Steps */}
              <Card className="border-0 shadow-lg">
                <CardHeader className="bg-gradient-to-r from-blue-50 to-indigo-50 pb-4 rounded-t-lg">
                  <div className="flex items-center justify-between">
                    <div>
                      <CardTitle className="text-lg flex items-center gap-2">
                        <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse"></div>
                        Team Chat
                      </CardTitle>
                      <CardDescription className="text-gray-600">
                        Real-time collaboration for this VC step
                      </CardDescription>
                    </div>
                    <div className="flex items-center space-x-1">
                      {sortedMessages.length > 0 && (
                        <span className="text-xs bg-blue-100 text-blue-700 px-2 py-1 rounded-full">
                          {sortedMessages.length} messages
                        </span>
                      )}
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="space-y-4">
                  {/* Chat Messages */}
                  <div
                    ref={messagesContainerRef}
                    className="space-y-3 max-h-96 overflow-y-auto"
                  >
                    {chatLoading && (
                      <div className="text-center py-4 text-gray-500">
                        Loading messages...
                      </div>
                    )}
                    {chatError && (
                      <div className="text-center py-4 text-red-500">
                        Error loading messages: {chatError.message}
                      </div>
                    )}
                    {!chatLoading &&
                      !chatError &&
                      sortedMessages.map((message, index) => (
                        <div
                          key={`msg-${message.id}-${index}`}
                          className={`flex space-x-3 p-3 rounded border ${
                            message.message_type === "system"
                              ? "bg-blue-50 border-blue-200"
                              : message.user_id === parseInt(user?.id || "0")
                                ? "bg-green-50 border-green-200"
                                : "bg-white"
                          }`}
                        >
                          <div
                            className={`w-8 h-8 rounded-full flex items-center justify-center text-white text-sm font-medium ${
                              message.message_type === "system"
                                ? "bg-orange-500"
                                : "bg-blue-500"
                            }`}
                          >
                            {message.message_type === "system"
                              ? "📋"
                              : message.user_name.charAt(0)}
                          </div>
                          <div className="flex-1">
                            <div className="flex items-center justify-between mb-1">
                              <span className="text-sm font-medium text-gray-900">
                                {message.user_id === parseInt(user?.id || "0")
                                  ? "Me"
                                  : message.user_name}
                              </span>
                              <div className="flex items-center space-x-2">
                                <span className="text-xs text-gray-500">
                                  {formatToISTDateTime(message.created_at)}
                                </span>
                                {message.message_type !== "system" && (
                                  <>
                                    {/* Only show edit/delete for own messages */}
                                    {message.user_id ===
                                      parseInt(user?.id || "0") && (
                                      <>
                                        <Button
                                          size="sm"
                                          variant="ghost"
                                          onClick={() =>
                                            handleEditMessage(
                                              message.id,
                                              message.message,
                                              message.is_rich_text,
                                            )
                                          }
                                          className="text-gray-600 hover:text-gray-700"
                                        >
                                          <Edit className="w-3 h-3" />
                                        </Button>
                                        <Button
                                          size="sm"
                                          variant="ghost"
                                          onClick={() =>
                                            handleDeleteMessage(message.id)
                                          }
                                          className="text-red-600 hover:text-red-700"
                                        >
                                          <Trash2 className="w-3 h-3" />
                                        </Button>
                                      </>
                                    )}
                                    <Button
                                      size="sm"
                                      variant="ghost"
                                      onClick={() => handleFollowUp(message.id)}
                                      className="text-blue-600 hover:text-blue-700"
                                    >
                                      <Reply className="w-3 h-3 mr-1" />
                                      Follow-up
                                    </Button>
                                  </>
                                )}
                              </div>
                            </div>
                            <div className="text-sm text-gray-700">
                              {editingMessageId === message.id ? (
                                <div className="space-y-2">
                                  <RichTextEditor
                                    value={editMessageText}
                                    onChange={setEditMessageText}
                                    placeholder="Edit your message with rich formatting..."
                                    className="min-h-[80px] border-gray-200"
                                  />
                                  <div className="flex space-x-2">
                                    <Button
                                      size="sm"
                                      onClick={() =>
                                        handleSaveEdit(
                                          message.id,
                                          message.is_rich_text,
                                        )
                                      }
                                      disabled={!editMessageText.trim()}
                                    >
                                      Save
                                    </Button>
                                    <Button
                                      size="sm"
                                      variant="outline"
                                      onClick={handleCancelEdit}
                                    >
                                      Cancel
                                    </Button>
                                  </div>
                                </div>
                              ) : (
                                <div
                                  dangerouslySetInnerHTML={{
                                    __html: processMessageContent(
                                      message.message,
                                    ),
                                  }}
                                />
                              )}
                              {message.attachments &&
                                message.attachments.length > 0 && (
                                  <div className="mt-2 space-y-1">
                                    {message.attachments.map(
                                      (attachment, idx) => {
                                        const fname =
                                          attachment.filename ||
                                          attachment.file_name ||
                                          "file";
                                        const directPath =
                                          attachment.file_path ||
                                          attachment.path ||
                                          "";
                                        const downloadUrl =
                                          attachment.download_url ||
                                          (attachment.filename
                                            ? `/api/files/download/${attachment.filename}`
                                            : directPath);
                                        return (
                                          <div
                                            key={idx}
                                            className="flex items-center space-x-2 text-xs bg-gray-100 px-2 py-1 rounded"
                                          >
                                            <FileText className="w-3 h-3" />
                                            <a
                                              href={downloadUrl || "#"}
                                              onClick={async (e) => {
                                                e.stopPropagation();
                                                if (!downloadUrl) return;
                                                try {
                                                  if (attachment.filename) {
                                                    const response =
                                                      await fetch(
                                                        `/api/files/download/${attachment.filename}`,
                                                      );
                                                    if (!response.ok)
                                                      throw new Error(
                                                        "Download failed",
                                                      );
                                                    const blob =
                                                      await response.blob();
                                                    const url =
                                                      window.URL.createObjectURL(
                                                        blob,
                                                      );
                                                    const link =
                                                      document.createElement(
                                                        "a",
                                                      );
                                                    link.href = url;
                                                    link.download =
                                                      attachment.file_name ||
                                                      fname;
                                                    document.body.appendChild(
                                                      link,
                                                    );
                                                    link.click();
                                                    document.body.removeChild(
                                                      link,
                                                    );
                                                    window.URL.revokeObjectURL(
                                                      url,
                                                    );
                                                  } else {
                                                    window.open(
                                                      downloadUrl,
                                                      "_blank",
                                                    );
                                                  }
                                                } catch (err) {
                                                  console.error(
                                                    "Download failed:",
                                                    err,
                                                  );
                                                  alert(
                                                    "Download failed. File may not be available.",
                                                  );
                                                }
                                              }}
                                              download={!!attachment.filename}
                                              className="text-blue-600 hover:underline"
                                            >
                                              {fname}
                                            </a>
                                            {attachment.file_size ? (
                                              <span className="text-gray-500">
                                                (
                                                {(
                                                  attachment.file_size / 1024
                                                ).toFixed(1)}{" "}
                                                KB)
                                              </span>
                                            ) : null}
                                          </div>
                                        );
                                      },
                                    )}
                                  </div>
                                )}
                            </div>
                          </div>
                        </div>
                      ))}
                  </div>

                  {/* Staged Attachments Display */}
                  {stagedAttachments.length > 0 && (
                    <div className="border-t pt-3">
                      <Label className="text-sm font-medium mb-2 block">
                        Attachments ({stagedAttachments.length})
                      </Label>
                      <div className="space-y-2">
                        {stagedAttachments.map((attachment, index) => (
                          <div
                            key={index}
                            className="flex items-center justify-between p-2 bg-gray-100 rounded text-sm"
                          >
                            <div className="flex items-center space-x-2">
                              <FileText className="w-4 h-4" />
                              <span>{attachment.file_name}</span>
                              <span className="text-gray-500">
                                ({(attachment.file_size / 1024).toFixed(1)} KB)
                              </span>
                            </div>
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => removeAttachment(index)}
                              className="text-red-600 hover:text-red-700"
                            >
                              <X className="w-4 h-4" />
                            </Button>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Follow-up Creation Section */}
                  {createFollowUp && (
                    <div className="border-t pt-4">
                      <div className="bg-blue-50 p-4 rounded-lg border border-blue-200">
                        <Label className="text-sm font-medium mb-3 block">
                          Create Follow-up Task
                        </Label>
                        <div className="space-y-3">
                          <Textarea
                            placeholder="Follow-up description..."
                            value={followUpNotes}
                            onChange={(e) => setFollowUpNotes(e.target.value)}
                            className="min-h-[60px]"
                          />
                          <div className="grid grid-cols-2 gap-3">
                            <Select
                              value={followUpAssignTo}
                              onValueChange={setFollowUpAssignTo}
                            >
                              <SelectTrigger>
                                <SelectValue placeholder="Assign to..." />
                              </SelectTrigger>
                              <SelectContent>
                                {teamMembers.map((member) => (
                                  <SelectItem
                                    key={member.id}
                                    value={member.id.toString()}
                                  >
                                    {member.name}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                            <Input
                              type="date"
                              value={followUpDueDate}
                              onChange={(e) =>
                                setFollowUpDueDate(e.target.value)
                              }
                            />
                          </div>
                          <div className="flex space-x-2">
                            <Button size="sm" onClick={handleCreateFollowUp}>
                              Create Follow-up
                            </Button>
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => setCreateFollowUp(false)}
                            >
                              Cancel
                            </Button>
                          </div>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Message Input Section */}
                  <div className="border-t pt-4">
                    <div className="space-y-3">
                      <RichTextEditor
                        value={newMessage}
                        onChange={setNewMessage}
                        placeholder="Type your message with rich formatting..."
                        className="min-h-[100px] border-gray-300"
                      />

                      <div className="flex items-center justify-between">
                        <div className="flex items-center space-x-2">
                          <input
                            type="file"
                            ref={fileInputRef}
                            onChange={handleFileUpload}
                            multiple
                            className="hidden"
                          />
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => fileInputRef.current?.click()}
                          >
                            <Paperclip className="w-4 h-4 mr-1" />
                            Attach Files
                          </Button>
                        </div>
                        <Button
                          size="sm"
                          onClick={handleSendMessage}
                          disabled={
                            !newMessage.trim() && stagedAttachments.length === 0
                          }
                        >
                          <Send className="w-4 h-4 mr-1" />
                          Send
                        </Button>
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>
          </div>
        </CollapsibleContent>
      </Collapsible>

      {/* Delete Message Confirmation Dialog */}
      <AlertDialog open={deleteConfirmOpen} onOpenChange={setDeleteConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Message</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete this message? This action cannot
              be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={cancelDeleteMessage}>
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction onClick={confirmDeleteMessage}>
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
