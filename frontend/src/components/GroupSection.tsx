import React, { useState, useEffect, useMemo, useCallback, useRef } from "react";
import type { GroupItem, UserSummary } from "../types";


interface GroupSectionProps {
  token: string | null;
  currentUser: { id: string; name: string; email: string } | null;
  botStatus: "idle" | "joining" | "running";
  onJoinMeeting: (url: string) => void;
  onSelectMeetingRecord?: (meetingUrl: string) => void;
  onOpenAuthModal?: () => void;
}

const MEET_RE = /^https:\/\/meet\.google\.com\/[\w-]+(\/|\?|#|$)/i;

export const GroupSection: React.FC<GroupSectionProps> = ({
  token,
  currentUser,
  botStatus,
  onJoinMeeting,
  onOpenAuthModal,
}) => {
  const [groups, setGroups] = useState<GroupItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [filterTab, setFilterTab] = useState<"all" | "admin" | "member">("all");
  const [searchQuery, setSearchQuery] = useState("");

  // Create Group Modal states
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [newGroupName, setNewGroupName] = useState("");
  const [newGroupDesc, setNewGroupDesc] = useState("");
  const [registeredUsers, setRegisteredUsers] = useState<UserSummary[]>([]);
  const [userSearch, setUserSearch] = useState("");
  const [selectedUserIds, setSelectedUserIds] = useState<string[]>([]);
  const [createLoading, setCreateLoading] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);

  // Group Detail / Meeting Hub Modal states
  const [selectedGroup, setSelectedGroup] = useState<GroupItem | null>(null);
  const selectedGroupIdRef = useRef<string | null>(null);
  const [meetUrlInput, setMeetUrlInput] = useState("");
  const [sharingLoading, setSharingLoading] = useState(false);
  const [groupActionMessage, setGroupActionMessage] = useState<string | null>(null);
  const [groupActionError, setGroupActionError] = useState<string | null>(null);

  const getHeaders = useCallback(() => {
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      "ngrok-skip-browser-warning": "true",
    };
    if (token) {
      headers["Authorization"] = `Bearer ${token}`;
    }
    return headers;
  }, [token]);

  /* ── Fetch groups from backend ───────────────────────────── */
  const fetchGroups = useCallback(async () => {
    if (!token) return;
    try {
      setLoading(true);
      const res = await fetch("/api/groups", {
        headers: getHeaders(),
      });
      if (res.ok) {
        const data = await res.json();
        const freshGroups: GroupItem[] = data.groups || [];
        setGroups(freshGroups);

        // Only update selectedGroup if the modal is currently open and wasn't closed by the user
        if (selectedGroupIdRef.current) {
          const updated = freshGroups.find((g: GroupItem) => g.id === selectedGroupIdRef.current);
          if (updated) {
            setSelectedGroup((prev) => (prev ? updated : null));
          }
        }
      }
    } catch (err) {
      console.warn("Could not fetch groups:", err);
    } finally {
      setLoading(false);
    }
  }, [token, getHeaders]);

  // Initial fetch and auto-refresh every 8 seconds so participants get live meet links
  useEffect(() => {
    fetchGroups();
    const interval = setInterval(fetchGroups, 8000);
    return () => clearInterval(interval);
  }, [fetchGroups]);


  /* ── Fetch registered users when create modal opens ──────── */
  const fetchRegisteredUsers = async () => {
    if (!token) return;
    try {
      const res = await fetch("/api/auth/users", {
        headers: getHeaders(),
      });
      if (res.ok) {
        const data = await res.json();
        setRegisteredUsers(data.users || []);
      }
    } catch (err) {
      console.warn("Could not fetch registered users:", err);
    }
  };

  const handleOpenCreateModal = () => {
    if (!token || !currentUser) {
      if (onOpenAuthModal) onOpenAuthModal();
      return;
    }
    setNewGroupName("");
    setNewGroupDesc("");
    setSelectedUserIds([]);
    setUserSearch("");
    setCreateError(null);
    setIsCreateModalOpen(true);
    fetchRegisteredUsers();
  };


  const toggleUserSelection = (userId: string) => {
    setSelectedUserIds((prev) =>
      prev.includes(userId) ? prev.filter((id) => id !== userId) : [...prev, userId]
    );
  };

  const handleSelectAllUsers = () => {
    const candidateIds = registeredUsers
      .filter((u) => u.id !== currentUser?.id)
      .map((u) => u.id);
    if (selectedUserIds.length === candidateIds.length) {
      setSelectedUserIds([]);
    } else {
      setSelectedUserIds(candidateIds);
    }
  };

  /* ── Submit Create Group ─────────────────────────────────── */
  const handleCreateGroup = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newGroupName.trim()) {
      setCreateError("Please enter a group name.");
      return;
    }

    try {
      setCreateLoading(true);
      setCreateError(null);
      const res = await fetch("/api/groups", {
        method: "POST",
        headers: getHeaders(),
        body: JSON.stringify({
          name: newGroupName.trim(),
          description: newGroupDesc.trim(),
          memberIds: selectedUserIds,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        setCreateError(data.error || "Failed to create group.");
        return;
      }

      setIsCreateModalOpen(false);
      await fetchGroups();
    } catch (err: any) {
      setCreateError(err.message || "Network error while creating group.");
    } finally {
      setCreateLoading(false);
    }
  };

  /* ── Select Group to View Details ────────────────────────── */
  const handleSelectGroup = (group: GroupItem) => {
    selectedGroupIdRef.current = group.id;
    setSelectedGroup(group);
    setMeetUrlInput(group.activeMeeting?.url || "");
    setGroupActionMessage(null);
    setGroupActionError(null);
  };

  const handleCloseDetailModal = () => {
    selectedGroupIdRef.current = null;
    setSelectedGroup(null);
    setGroupActionMessage(null);
    setGroupActionError(null);
  };


  /* ── Admin: Share Google Meet Link ───────────────────────── */
  const handleShareMeeting = async () => {
    if (!selectedGroup) return;
    const cleanUrl = meetUrlInput.trim();

    if (!cleanUrl) {
      setGroupActionError("Please paste a valid Google Meet link.");
      return;
    }
    if (!MEET_RE.test(cleanUrl)) {
      setGroupActionError("Invalid Google Meet URL format (must be https://meet.google.com/xxx-xxxx-xxx).");
      return;
    }

    try {
      setSharingLoading(true);
      setGroupActionError(null);
      setGroupActionMessage(null);

      const res = await fetch(`/api/groups/${selectedGroup.id}/meeting`, {
        method: "POST",
        headers: getHeaders(),
        body: JSON.stringify({ url: cleanUrl }),
      });

      const data = await res.json();
      if (!res.ok) {
        setGroupActionError(data.error || "Failed to share meeting link.");
        return;
      }

      setGroupActionMessage("Google Meet link shared with all group members!");
      await fetchGroups();
    } catch (err: any) {
      setGroupActionError(err.message || "Error sharing meeting link.");
    } finally {
      setSharingLoading(false);
    }
  };

  /* ── Admin: Clear/End Active Meeting ─────────────────────── */
  const handleClearMeeting = async () => {
    if (!selectedGroup) return;
    try {
      setSharingLoading(true);
      setGroupActionError(null);
      setGroupActionMessage(null);

      const res = await fetch(`/api/groups/${selectedGroup.id}/meeting`, {
        method: "DELETE",
        headers: getHeaders(),
      });

      if (res.ok) {
        setGroupActionMessage("Active meeting ended.");
        setMeetUrlInput("");
        await fetchGroups();
      }
    } catch (err: any) {
      setGroupActionError(err.message || "Error ending meeting.");
    } finally {
      setSharingLoading(false);
    }
  };

  /* ── Launch Bot to Join ──────────────────────────────────── */
  const handleLaunchBot = (url: string) => {
    onJoinMeeting(url);
    setGroupActionMessage("Deploying MeetMinutes AI Bot to room...");
  };

  /* ── Delete Group ────────────────────────────────────────── */
  const handleDeleteGroup = async (groupId: string) => {
    if (!window.confirm("Are you sure you want to delete this group? This cannot be undone.")) {
      return;
    }
    try {
      const res = await fetch(`/api/groups/${groupId}`, {
        method: "DELETE",
        headers: getHeaders(),
      });
      if (res.ok) {
        if (selectedGroup?.id === groupId) {
          handleCloseDetailModal();
        }
        await fetchGroups();
      }
    } catch (err) {
      console.warn("Failed to delete group:", err);
    }
  };

  /* ── Filtered Groups List ────────────────────────────────── */
  const filteredGroups = useMemo(() => {
    return groups.filter((g) => {
      const matchesSearch =
        g.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        (g.description && g.description.toLowerCase().includes(searchQuery.toLowerCase()));

      if (!matchesSearch) return false;
      if (filterTab === "admin") return g.isAdmin;
      if (filterTab === "member") return !g.isAdmin;
      return true;
    });
  }, [groups, searchQuery, filterTab]);

  /* ── Filtered Users for Creation Modal ───────────────────── */
  const filteredUsers = useMemo(() => {
    return registeredUsers.filter((u) => {
      if (u.id === currentUser?.id) return false; // Don't list creator in member picker
      if (!userSearch.trim()) return true;
      const q = userSearch.toLowerCase();
      return u.name.toLowerCase().includes(q) || u.email.toLowerCase().includes(q);
    });
  }, [registeredUsers, currentUser, userSearch]);

  const getAvatarColor = (name: string) => {
    const colors = [
      "#6366f1",
      "#10b981",
      "#f59e0b",
      "#ec4899",
      "#8b5cf6",
      "#06b6d4",
      "#3b82f6",
      "#14b8a6",
    ];
    let hash = 0;
    for (let i = 0; i < name.length; i++) hash = name.charCodeAt(i) + ((hash << 5) - hash);
    return colors[Math.abs(hash) % colors.length];
  };

  return (
    <section className="groups-container-section" aria-label="Collaboration Groups">
      {/* ── Section Header ────────────────────────────────── */}
      <div className="groups-section-header">
        <div className="header-titles">
          <div className="groups-title-row">
            <span className="groups-title-icon">👥</span>
            <h2 className="groups-title">Collaboration Groups</h2>
            <span className="groups-badge">{groups.length} {groups.length === 1 ? "group" : "groups"}</span>
          </div>
          <p className="groups-subtitle">
            Create groups, invite registered colleagues, share Google Meet links, and deploy your AI meeting bot together.
          </p>
        </div>

        <button className="btn-create-group" onClick={handleOpenCreateModal}>
          <span className="btn-plus-icon">+</span>
          <span>Create New Group</span>
        </button>
      </div>

      {/* ── Toolbar: Tabs & Search ────────────────────────── */}
      <div className="groups-toolbar">
        <div className="groups-tabs">
          <button
            className={`groups-tab-btn ${filterTab === "all" ? "active" : ""}`}
            onClick={() => setFilterTab("all")}
          >
            All Groups ({groups.length})
          </button>
          <button
            className={`groups-tab-btn ${filterTab === "admin" ? "active" : ""}`}
            onClick={() => setFilterTab("admin")}
          >
            👑 Created by Me ({groups.filter((g) => g.isAdmin).length})
          </button>
          <button
            className={`groups-tab-btn ${filterTab === "member" ? "active" : ""}`}
            onClick={() => setFilterTab("member")}
          >
            Joined as Member ({groups.filter((g) => !g.isAdmin).length})
          </button>
        </div>

        <div className="groups-search-box">
          <span className="search-icon">🔍</span>
          <input
            type="text"
            className="groups-search-input"
            placeholder="Filter groups by name..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
          {searchQuery && (
            <button className="search-clear" onClick={() => setSearchQuery("")}>
              ✕
            </button>
          )}
        </div>
      </div>

      {/* ── Groups Cards Grid ─────────────────────────────── */}
      {loading && groups.length === 0 ? (
        <div className="groups-empty-state">
          <span className="spinner-dot" />
          <p>Loading your groups...</p>
        </div>
      ) : filteredGroups.length === 0 ? (
        <div className="groups-empty-state">
          <span className="empty-state-icon">📂</span>
          <h3>No groups found</h3>
          <p>
            {searchQuery
              ? "No groups match your search criteria."
              : filterTab === "admin"
              ? "You haven't created any groups yet. Click '+ Create New Group' above to get started!"
              : filterTab === "member"
              ? "You haven't been added to any groups yet."
              : "Create your first group to share Google Meet links with participants."}
          </p>
          {!searchQuery && (
            <button className="btn-empty-action" onClick={handleOpenCreateModal}>
              + Create a Group Now
            </button>
          )}
        </div>
      ) : (
        <div className="groups-grid">
          {filteredGroups.map((group) => {
            const hasActiveMeeting =
              group.activeMeeting && group.activeMeeting.status === "active";
            const totalMembersCount = (group.members?.length || 0) + 1; // including admin

            return (
              <div
                key={group.id}
                className={`group-card ${hasActiveMeeting ? "has-live-meeting" : ""}`}
                onClick={() => handleSelectGroup(group)}
              >
                {/* Active Meeting Banner */}
                {hasActiveMeeting && (
                  <div className="live-meeting-ribbon">
                    <span className="ribbon-pulse" />
                    <span className="ribbon-text">LIVE MEET LINK ACTIVE</span>
                  </div>
                )}

                <div className="group-card-header">
                  <div className="group-title-col">
                    <h3 className="group-name">{group.name}</h3>
                    {group.description && (
                      <p className="group-desc">{group.description}</p>
                    )}
                  </div>

                  <div className="group-role-badge-wrapper">
                    {group.isAdmin ? (
                      <span className="role-badge role-badge-admin" title="You created this group">
                        👑 You are Admin
                      </span>
                    ) : (
                      <span
                        className="role-badge role-badge-member"
                        title={`Created by ${group.admin.name}`}
                      >
                        👤 Member
                      </span>
                    )}
                  </div>
                </div>

                {/* Member Avatar Stack */}
                <div className="group-members-row">
                  <div className="avatar-stack">
                    {/* Admin Avatar */}
                    <span
                      className="avatar-bubble admin-bubble"
                      style={{ backgroundColor: getAvatarColor(group.admin.name) }}
                      title={`Admin: ${group.admin.name} (${group.admin.email})`}
                    >
                      {group.admin.name[0]?.toUpperCase()}
                    </span>

                    {/* Member Avatars */}
                    {(group.members || []).slice(0, 4).map((member) => (
                      <span
                        key={member.id}
                        className="avatar-bubble"
                        style={{ backgroundColor: getAvatarColor(member.name) }}
                        title={`${member.name} (${member.email})`}
                      >
                        {member.name[0]?.toUpperCase()}
                      </span>
                    ))}

                    {/* Overflow count */}
                    {(group.members?.length || 0) > 4 && (
                      <span className="avatar-bubble overflow-bubble">
                        +{(group.members?.length || 0) - 4}
                      </span>
                    )}
                  </div>

                  <span className="member-count-label">
                    {totalMembersCount} {totalMembersCount === 1 ? "participant" : "participants"}
                  </span>
                </div>

                {/* Live Meeting Preview if active */}
                {hasActiveMeeting ? (
                  <div className="card-meeting-banner" onClick={(e) => e.stopPropagation()}>
                    <div className="banner-left">
                      <span className="banner-meet-icon">📹</span>
                      <div className="banner-details">
                        <span className="banner-title">Google Meet Ready</span>
                        <span className="banner-url">{group.activeMeeting?.url}</span>
                      </div>
                    </div>

                    <div className="banner-actions">
                      <a
                        href={group.activeMeeting?.url}
                        target="_blank"
                        rel="noreferrer"
                        className="btn-card-meet-join"
                        title="Join Google Meet in new tab"
                      >
                        Join Room ↗
                      </a>
                      {group.isAdmin && (
                        <button
                          className="btn-card-bot-deploy"
                          onClick={() => handleLaunchBot(group.activeMeeting!.url)}
                          title="Deploy MeetMinutes bot to this room"
                        >
                          🤖 Start Bot
                        </button>
                      )}
                    </div>
                  </div>
                ) : (
                  <div className="card-footer-info">
                    <span className="footer-status-text">
                      {group.isAdmin ? "Click to share a meeting link" : "No active meeting"}
                    </span>
                    <span className="card-open-link">Open Group →</span>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* ── CREATE GROUP MODAL ────────────────────────────── */}
      {/* ── CREATE GROUP MODAL ────────────────────────────── */}
      {isCreateModalOpen && (
        <div className="group-modal-overlay" onClick={() => setIsCreateModalOpen(false)}>
          <div className="group-modal-card" onClick={(e) => e.stopPropagation()}>
            <div className="group-modal-header">
              <div className="modal-title-col">
                <span className="modal-badge">New Workspace</span>
                <h3 className="modal-heading">Create a New Group</h3>
                <p className="modal-subheading">
                  You will be the admin of this group and can share Google Meet links and deploy the AI bot.
                </p>
              </div>
              <button
                type="button"
                className="modal-close-btn"
                onClick={() => setIsCreateModalOpen(false)}
                aria-label="Close modal"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleCreateGroup} className="group-create-form-wrapper">
              <div className="group-modal-body">
                {createError && (
                  <div className="form-alert form-alert-error">
                    <span>⚠</span> {createError}
                  </div>
                )}

                <div className="form-group">
                  <label className="form-label" htmlFor="group-name-input">
                    Group Name <span className="required-star">*</span>
                  </label>
                  <input
                    id="group-name-input"
                    type="text"
                    required
                    placeholder="e.g. Engineering Sprint Review, Product Sync, AI Core Team"
                    className="form-input"
                    value={newGroupName}
                    onChange={(e) => setNewGroupName(e.target.value)}
                    maxLength={80}
                  />
                </div>

                <div className="form-group">
                  <label className="form-label" htmlFor="group-desc-input">
                    Description <span className="optional-tag">(Optional)</span>
                  </label>
                  <input
                    id="group-desc-input"
                    type="text"
                    placeholder="e.g. Weekly standups and sprint planning discussions"
                    className="form-input"
                    value={newGroupDesc}
                    onChange={(e) => setNewGroupDesc(e.target.value)}
                    maxLength={250}
                  />
                </div>

                {/* Registered Users Selection */}
                <div className="participants-selector-block">
                  <div className="selector-header">
                    <div className="selector-title-row">
                      <label className="form-label">
                        Select Registered Participants ({selectedUserIds.length} selected)
                      </label>
                      <span className="selector-hint">
                        Selected users will see this group when they log in.
                      </span>
                    </div>

                    {filteredUsers.length > 0 && (
                      <button
                        type="button"
                        className="btn-select-all"
                        onClick={handleSelectAllUsers}
                      >
                        {selectedUserIds.length === filteredUsers.length
                          ? "Deselect All"
                          : "Select All"}
                      </button>
                    )}
                  </div>

                  {/* Search filter for users */}
                  <div className="user-search-wrapper">
                    <span className="user-search-icon">🔍</span>
                    <input
                      type="text"
                      className="user-search-input"
                      placeholder="Search by name or email..."
                      value={userSearch}
                      onChange={(e) => setUserSearch(e.target.value)}
                    />
                    {userSearch && (
                      <button
                        type="button"
                        className="search-clear-mini"
                        onClick={() => setUserSearch("")}
                      >
                        ✕
                      </button>
                    )}
                  </div>

                  {/* Users List */}
                  <div className="registered-users-list">
                    {registeredUsers.length === 0 ? (
                      <div className="users-empty-hint">
                        <span>👤</span> No other registered users found in database yet.
                      </div>
                    ) : filteredUsers.length === 0 ? (
                      <div className="users-empty-hint">
                        No users match &quot;{userSearch}&quot;
                      </div>
                    ) : (
                      filteredUsers.map((u) => {
                        const isSelected = selectedUserIds.includes(u.id);
                        return (
                          <div
                            key={u.id}
                            className={`user-pick-row ${isSelected ? "selected" : ""}`}
                            onClick={() => toggleUserSelection(u.id)}
                          >
                            <div className="checkbox-col">
                              <input
                                type="checkbox"
                                checked={isSelected}
                                onChange={() => {}} // Handled by row onClick
                                className="user-checkbox"
                              />
                            </div>

                            <span
                              className="user-row-avatar"
                              style={{ backgroundColor: getAvatarColor(u.name) }}
                            >
                              {u.name[0]?.toUpperCase()}
                            </span>

                            <div className="user-row-info">
                              <span className="user-row-name">{u.name}</span>
                              <span className="user-row-email">{u.email}</span>
                            </div>

                            {isSelected && <span className="selected-check-badge">✓ Added</span>}
                          </div>
                        );
                      })
                    )}
                  </div>
                </div>
              </div>

              <div className="group-modal-footer">
                <button
                  type="button"
                  className="btn-modal-cancel"
                  onClick={() => setIsCreateModalOpen(false)}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="btn-modal-submit"
                  disabled={createLoading || !newGroupName.trim()}
                >
                  {createLoading ? "Creating Group..." : `Create Group (${selectedUserIds.length + 1} Members)`}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ── GROUP DETAILS & MEET SHARING MODAL ────────────── */}
      {selectedGroup && (
        <div className="group-modal-overlay" onClick={handleCloseDetailModal}>
          <div className="group-detail-card" onClick={(e) => e.stopPropagation()}>
            <div className="group-modal-header">
              <div className="modal-title-col">
                <div className="detail-badges-row">
                  <span className="modal-badge">Group Workspace</span>
                  {selectedGroup.isAdmin ? (
                    <span className="role-badge role-badge-admin">👑 You are the Admin</span>
                  ) : (
                    <span className="role-badge role-badge-member">
                      👤 Created by {selectedGroup.admin.name}
                    </span>
                  )}
                </div>
                <h2 className="detail-group-title">{selectedGroup.name}</h2>
                {selectedGroup.description && (
                  <p className="detail-group-desc">{selectedGroup.description}</p>
                )}
              </div>
              <button
                type="button"
                className="modal-close-btn"
                onClick={(e) => {
                  e.stopPropagation();
                  handleCloseDetailModal();
                }}
                aria-label="Close details"
              >
                ✕
              </button>
            </div>


            <div className="group-modal-body">
              {/* Action Feedback alerts */}
              {groupActionMessage && (
                <div className="form-alert form-alert-success">
                  <span>✓</span> {groupActionMessage}
                </div>
              )}

            {groupActionError && (
              <div className="form-alert form-alert-error">
                <span>⚠</span> {groupActionError}
              </div>
            )}

            {/* ── Google Meet Link Hub ────────────────────── */}
            <div className="group-meet-hub-card">
              <div className="meet-hub-header">
                <div className="hub-title-group">
                  <span className="hub-icon">📹</span>
                  <div>
                    <h4 className="hub-heading">Google Meet Link Sharing</h4>
                    <p className="hub-sub">
                      {selectedGroup.isAdmin
                        ? "Share a Google Meet URL with all group participants and launch the AI Bot."
                        : "Meeting link shared by the group admin for this session."}
                    </p>
                  </div>
                </div>

                {selectedGroup.activeMeeting?.status === "active" && (
                  <div className="hub-live-badge">
                    <span className="ribbon-pulse" />
                    <span>MEET ACTIVE</span>
                  </div>
                )}
              </div>

              {/* If Active Meeting Exists */}
              {selectedGroup.activeMeeting?.status === "active" ? (
                <div className="active-meeting-box">
                  <div className="active-link-display">
                    <span className="link-icon">🔗</span>
                    <a
                      href={selectedGroup.activeMeeting.url}
                      target="_blank"
                      rel="noreferrer"
                      className="active-url-anchor"
                      title="Open Google Meet in new tab"
                    >
                      {selectedGroup.activeMeeting.url}
                    </a>
                  </div>

                  <div className="active-meet-buttons">
                    <a
                      href={selectedGroup.activeMeeting.url}
                      target="_blank"
                      rel="noreferrer"
                      className="btn-join-meet-direct"
                    >
                      <span>📹 Join Google Meet Room ↗</span>
                    </a>

                    {/* Bot launch button: Available to Admin */}
                    {selectedGroup.isAdmin && (
                      <button
                        className={`btn-deploy-bot-group ${botStatus !== "idle" ? "active-bot" : ""}`}
                        onClick={() => handleLaunchBot(selectedGroup.activeMeeting!.url)}
                        disabled={botStatus !== "idle"}
                      >
                        <span>🤖</span>
                        <span>
                          {botStatus === "idle"
                            ? "Deploy AI Bot to Meeting"
                            : botStatus === "joining"
                            ? "Bot Connecting…"
                            : "Bot Active in Room"}
                        </span>
                      </button>
                    )}

                    {/* Admin: End Meeting */}
                    {selectedGroup.isAdmin && (
                      <button
                        className="btn-end-meet-group"
                        onClick={handleClearMeeting}
                        disabled={sharingLoading}
                      >
                        ✕ End Meeting
                      </button>
                    )}
                  </div>

                  <div className="bot-status-indicator-bar">
                    <span className="status-label">Meeting Agent Status:</span>
                    <span
                      className={`status-pill ${
                        botStatus === "running"
                          ? "status-pill-running"
                          : botStatus === "joining"
                          ? "status-pill-joining"
                          : "status-pill-idle"
                      }`}
                    >
                      <span className="pill-dot" />
                      {botStatus === "running"
                        ? "Bot is active in meeting & recording minutes"
                        : botStatus === "joining"
                        ? "Bot is joining the room…"
                        : "Bot is ready to join"}
                    </span>
                  </div>
                </div>
              ) : (
                /* No meeting active currently */
                <div className="no-active-meeting-box">
                  {selectedGroup.isAdmin ? (
                    <div className="admin-share-controls">
                      <p className="admin-instruction">
                        Paste a Google Meet link below to share with all {selectedGroup.members.length} participants:
                      </p>
                      <div className="share-input-row">
                        <input
                          type="url"
                          className="meet-share-input"
                          placeholder="https://meet.google.com/xxx-xxxx-xxx"
                          value={meetUrlInput}
                          onChange={(e) => {
                            setMeetUrlInput(e.target.value);
                            setGroupActionError(null);
                          }}
                        />
                        <button
                          type="button"
                          className="btn-share-meet"
                          onClick={handleShareMeeting}
                          disabled={sharingLoading || !meetUrlInput.trim()}
                        >
                          {sharingLoading ? "Sharing…" : "Share with Group"}
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div className="member-waiting-notice">
                      <span className="waiting-icon">⏳</span>
                      <p>
                        No Google Meet link has been shared yet. When the admin (
                        <strong>{selectedGroup.admin.name}</strong>) shares a link, it will appear
                        here automatically.
                      </p>
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* ── Group Participants List ────────────────── */}
            <div className="group-members-section">
              <div className="members-section-header">
                <h4 className="members-heading">
                  Group Participants ({(selectedGroup.members?.length || 0) + 1})
                </h4>
                <span className="members-subtitle">
                  All participants listed here have access to shared meetings in this group.
                </span>
              </div>

              <div className="members-table-wrap">
                {/* Admin Row */}
                <div className="member-card-row is-admin-row">
                  <div className="member-avatar-col">
                    <span
                      className="member-avatar"
                      style={{ backgroundColor: getAvatarColor(selectedGroup.admin.name) }}
                    >
                      {selectedGroup.admin.name[0]?.toUpperCase()}
                    </span>
                  </div>
                  <div className="member-info-col">
                    <div className="member-name-row">
                      <span className="member-name">{selectedGroup.admin.name}</span>
                      <span className="admin-crown-badge">👑 Group Creator / Admin</span>
                      {selectedGroup.admin.id === currentUser?.id && (
                        <span className="you-badge">(You)</span>
                      )}
                    </div>
                    <span className="member-email">{selectedGroup.admin.email}</span>
                  </div>
                </div>

                {/* Members Rows */}
                {(selectedGroup.members || []).map((m) => (
                  <div key={m.id} className="member-card-row">
                    <div className="member-avatar-col">
                      <span
                        className="member-avatar"
                        style={{ backgroundColor: getAvatarColor(m.name) }}
                      >
                        {m.name[0]?.toUpperCase()}
                      </span>
                    </div>
                    <div className="member-info-col">
                      <div className="member-name-row">
                        <span className="member-name">{m.name}</span>
                        <span className="member-role-badge">Participant</span>
                        {m.id === currentUser?.id && (
                          <span className="you-badge">(You)</span>
                        )}
                      </div>
                      <span className="member-email">{m.email}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
            </div>

            {/* Modal Footer */}
            <div className="group-modal-footer">
              {selectedGroup.isAdmin && (
                <button
                  type="button"
                  className="btn-delete-group-danger"
                  onClick={() => handleDeleteGroup(selectedGroup.id)}
                >
                  🗑 Delete Group
                </button>
              )}
              <button
                type="button"
                className="btn-modal-cancel"
                onClick={handleCloseDetailModal}
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

    </section>
  );
};
