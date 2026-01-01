// src/app/admin/users/page.tsx
'use client';

import { useState, useEffect, useMemo, useCallback } from 'react';
import { Users, Search, Trash2, Eye, Mail, Phone, Calendar, AlertCircle, Key, Copy, Check } from 'lucide-react';
import styles from './users.module.css';

interface User {
    id: string;
    email: string;
    full_name: string;
    phone: string;
    created_at: string;
    updated_at: string;
}

export default function UsersManagement() {
    const [users, setUsers] = useState<User[]>([]);
    const [loading, setLoading] = useState(true);
    const [searchTerm, setSearchTerm] = useState('');
    const [selectedUser, setSelectedUser] = useState<User | null>(null);
    const [showModal, setShowModal] = useState(false);
    const [deletingUserId, setDeletingUserId] = useState<string | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [resettingPassword, setResettingPassword] = useState<string | null>(null);
    const [temporaryPassword, setTemporaryPassword] = useState<string | null>(null);
    const [passwordCopied, setPasswordCopied] = useState(false);

    const fetchUsers = useCallback(async () => {
        try {
            // Fetch user data from admin API
            const response = await fetch('/api/admin/users/list');
            if (!response.ok) {
                const error = await response.json();
                throw new Error(error.message || 'Failed to fetch users');
            }
            const { users: mergedUsers } = await response.json();

            setUsers(mergedUsers);
            setError(null);
        } catch (error: any) {
            setError(error.message || 'Failed to load users');
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        fetchUsers();
    }, [fetchUsers]);

    const filteredUsers = useMemo(() => {
        if (!searchTerm) return users;
        const lowerSearch = searchTerm.toLowerCase();
        return users.filter(user =>
            user.email?.toLowerCase().includes(lowerSearch) ||
            user.full_name?.toLowerCase().includes(lowerSearch)
        );
    }, [searchTerm, users]);

    const handleDeleteUser = useCallback(async (userId: string) => {
        if (!confirm('Are you sure you want to delete this user? This will also delete their reviews and membership data.')) {
            return;
        }

        setDeletingUserId(userId);
        setError(null);

        try {
            const res = await fetch('/api/admin/users', {
                method: 'DELETE',
                headers: { 'Content-Type': 'application/json' },
                credentials: 'include',
                body: JSON.stringify({ id: userId })
            });

            const json = await res.json().catch(() => ({}));
            if (!res.ok) {
                throw new Error(json?.error || 'Failed to delete user');
            }

            // Remove user from local state
            setUsers(prev => prev.filter(u => u.id !== userId));
            if (selectedUser?.id === userId) {
                setShowModal(false);
                setSelectedUser(null);
            }
        } catch (error: any) {
            setError(error.message || 'Failed to delete user');
        } finally {
            setDeletingUserId(null);
        }
    }, []);

    const viewUserDetails = useCallback((user: User) => {
        setSelectedUser(user);
        setShowModal(true);
        setTemporaryPassword(null);
        setPasswordCopied(false);
    }, []);

    const handleResetPassword = useCallback(async (userId: string) => {
        if (!confirm('Are you sure you want to reset this user\'s password? A temporary password will be generated.')) {
            return;
        }

        setResettingPassword(userId);
        setError(null);
        setTemporaryPassword(null);
        setPasswordCopied(false);

        try {
            const res = await fetch('/api/admin/users/reset-password', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                credentials: 'include',
                body: JSON.stringify({ userId })
            });

            const json = await res.json();
            if (!res.ok) {
                throw new Error(json?.error || 'Failed to reset password');
            }

            setTemporaryPassword(json.temporaryPassword);
        } catch (error: any) {
            setError(error.message || 'Failed to reset password');
        } finally {
            setResettingPassword(null);
        }
    }, []);

    const copyPassword = useCallback(() => {
        if (temporaryPassword) {
            navigator.clipboard.writeText(temporaryPassword);
            setPasswordCopied(true);
            setTimeout(() => setPasswordCopied(false), 2000);
        }
    }, [temporaryPassword]);

    const formatDate = (dateString: string) => {
        if (!dateString) return 'N/A';
        return new Date(dateString).toLocaleDateString('en-US', {
            year: 'numeric',
            month: 'short',
            day: 'numeric'
        });
    };

    if (loading) {
        return (
            <div className={styles.loadingState}>
                <div className={styles.spinner}></div>
                <p>Loading users...</p>
            </div>
        );
    }

    return (
        <div className={styles.pageContainer}>
            {/* Header */}
            <div className={styles.pageHeader}>
                <div>
                    <h1 className={styles.pageTitle}>User Management</h1>
                    <p className={styles.pageSubtitle}>
                        Manage all registered users ({filteredUsers.length} total)
                    </p>
                </div>
            </div>

            {/* Error Display */}
            {error && (
                <div className={styles.errorMessage}>
                    <AlertCircle size={20} />
                    <span>{error}</span>
                    <button onClick={() => setError(null)}>×</button>
                </div>
            )}

            {/* Search Bar */}
            <div className={styles.searchContainer}>
                <Search size={20} className={styles.searchIcon} />
                <input
                    type="text"
                    placeholder="Search by name or email..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className={styles.searchInput}
                />
            </div>

            {/* Users Table */}
            <div className={styles.tableContainer}>
                <table className={styles.table}>
                    <thead>
                        <tr>
                            <th>Name</th>
                            <th>Email</th>
                            <th>Phone</th>
                            <th>Joined Date</th>
                            <th>Actions</th>
                        </tr>
                    </thead>
                    <tbody>
                        {filteredUsers.length === 0 ? (
                            <tr>
                                <td colSpan={5} className={styles.emptyState}>
                                    <Users size={48} />
                                    <p>No users found</p>
                                </td>
                            </tr>
                        ) : (
                            filteredUsers.map((user) => (
                                <tr key={user.id}>
                                    <td>
                                        <div className={styles.userCell}>
                                            <div className={styles.avatar}>
                                                {user.full_name?.charAt(0)?.toUpperCase() || 'U'}
                                            </div>
                                            <span>{user.full_name || 'N/A'}</span>
                                        </div>
                                    </td>
                                    <td>{user.email}</td>
                                    <td>{user.phone || 'N/A'}</td>
                                    <td>{formatDate(user.created_at)}</td>
                                    <td>
                                        <div className={styles.actionButtons}>
                                            <button
                                                onClick={() => viewUserDetails(user)}
                                                className={styles.actionBtn}
                                                title="View Details"
                                            >
                                                <Eye size={18} />
                                            </button>
                                            <button
                                                onClick={() => handleDeleteUser(user.id)}
                                                className={`${styles.actionBtn} ${styles.deleteBtn}`}
                                                title="Delete User"
                                                disabled={deletingUserId === user.id}
                                            >
                                                {deletingUserId === user.id ? (
                                                    <div className={styles.spinnerSmall}></div>
                                                ) : (
                                                    <Trash2 size={18} />
                                                )}
                                            </button>
                                        </div>
                                    </td>
                                </tr>
                            ))
                        )}
                    </tbody>
                </table>
            </div>

            {/* User Details Modal */}
            {showModal && selectedUser && (
                <div className={styles.modalOverlay} onClick={() => setShowModal(false)}>
                    <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
                        <div className={styles.modalHeader}>
                            <h2>User Details</h2>
                            <button
                                onClick={() => setShowModal(false)}
                                className={styles.closeButton}
                            >
                                ×
                            </button>
                        </div>

                        <div className={styles.modalBody}>
                            <div className={styles.detailRow}>
                                <Users size={20} />
                                <div>
                                    <label>Full Name</label>
                                    <p>{selectedUser.full_name || 'N/A'}</p>
                                </div>
                            </div>

                            <div className={styles.detailRow}>
                                <Mail size={20} />
                                <div>
                                    <label>Email</label>
                                    <p>{selectedUser.email}</p>
                                </div>
                            </div>

                            <div className={styles.detailRow}>
                                <Phone size={20} />
                                <div>
                                    <label>Phone</label>
                                    <p>{selectedUser.phone || 'N/A'}</p>
                                </div>
                            </div>

                            <div className={styles.detailRow}>
                                <Calendar size={20} />
                                <div>
                                    <label>Joined Date</label>
                                    <p>{formatDate(selectedUser.created_at)}</p>
                                </div>
                            </div>

                            <div className={styles.detailRow}>
                                <Calendar size={20} />
                                <div>
                                    <label>Last Updated</label>
                                    <p>{formatDate(selectedUser.updated_at)}</p>
                                </div>
                            </div>
                        </div>

                        {/* Password Reset Section */}
                        <div className={styles.passwordResetSection}>
                            <div className={styles.passwordResetHeader}>
                                <Key size={20} />
                                <h3>Password Reset</h3>
                            </div>

                            {temporaryPassword ? (
                                <div className={styles.temporaryPasswordBox}>
                                    <div className={styles.passwordDisplay}>
                                        <code className={styles.passwordText}>{temporaryPassword}</code>
                                        <button
                                            onClick={copyPassword}
                                            className={styles.copyButton}
                                            title="Copy password"
                                        >
                                            {passwordCopied ? (
                                                <Check size={18} className={styles.checkIcon} />
                                            ) : (
                                                <Copy size={18} />
                                            )}
                                        </button>
                                    </div>
                                    <p className={styles.passwordWarning}>
                                        ⚠️ Share this temporary password with the user. They must change it immediately after login.
                                    </p>
                                </div>
                            ) : (
                                <p className={styles.passwordResetInfo}>
                                    Generate a temporary password for this user. They will receive a notification and must change it after login.
                                </p>
                            )}

                            <button
                                onClick={() => handleResetPassword(selectedUser.id)}
                                disabled={resettingPassword === selectedUser.id}
                                className={styles.resetPasswordButton}
                            >
                                {resettingPassword === selectedUser.id ? (
                                    <>
                                        <div className={styles.spinnerSmall}></div>
                                        Resetting...
                                    </>
                                ) : (
                                    <>
                                        <Key size={18} />
                                        {temporaryPassword ? 'Reset Again' : 'Reset Password'}
                                    </>
                                )}
                            </button>
                        </div>

                        <div className={styles.modalFooter}>
                            <button
                                onClick={() => {
                                    setShowModal(false);
                                    setTemporaryPassword(null);
                                    setPasswordCopied(false);
                                }}
                                className={styles.secondaryButton}
                            >
                                Close
                            </button>
                            <button
                                onClick={() => {
                                    handleDeleteUser(selectedUser.id);
                                    setShowModal(false);
                                }}
                                className={styles.dangerButton}
                            >
                                Delete User
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}