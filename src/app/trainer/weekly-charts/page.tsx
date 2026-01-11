// src/app/trainer/weekly-charts/page.tsx
'use client';

import { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { Calendar, FileText, Upload, Edit, Trash2, Plus, Download, X, ChevronDown, Clock, Sparkles } from 'lucide-react';
import Toast from '@/components/Toast/Toast';
import { useToast } from '@/hooks/useToast';
import styles from './weekly-charts.module.css';
import cardStyles from '@/components/UserCard/UserCard.module.css';

interface WeeklyChart {
    id: number;
    membership_id: number;
    week_number: number;
    chart_type: string;
    title: string | null;
    content: string | null;
    file_url: string | null;
    created_at: string;
}

interface Client {
    membership_id: number;
    user_id: string;
    user_name: string;
    user_email: string;
    plan_name: string;
    status: string;
    start_date?: string | null;
    charts: WeeklyChart[];
}

export default function TrainerWeeklyChartsPage() {
    const [clients, setClients] = useState<Client[]>([]);
    const [loading, setLoading] = useState(true);
    const [selectedClient, setSelectedClient] = useState<Client | null>(null);
    const [showChartModal, setShowChartModal] = useState(false);
    const [editingChart, setEditingChart] = useState<WeeklyChart | null>(null);
    const [chartForm, setChartForm] = useState({
        week_number: '',
        chart_type: 'workout',
        title: '',
        content: '',
        file_url: ''
    });
    const [uploadingFile, setUploadingFile] = useState(false);
    const [selectedFile, setSelectedFile] = useState<File | null>(null);
    const [previewUrl, setPreviewUrl] = useState<string | null>(null);
    const fileInputRef = useRef<HTMLInputElement>(null);
    const [expandedUsers, setExpandedUsers] = useState<Set<string>>(new Set());
    const [currentPage, setCurrentPage] = useState(1);
    const [showAIModal, setShowAIModal] = useState(false);
    const [generatingAI, setGeneratingAI] = useState(false);
    const [aiForm, setAiForm] = useState({
        week_number: '',
        chart_type: 'workout'
    });
    const itemsPerPage = 10;
    const { toast, toastType, showToast, hideToast } = useToast();

    useEffect(() => {
        fetchClientsAndCharts();
    }, []);

    const fetchClientsAndCharts = async () => {
        try {
            setLoading(true);
            const response = await fetch('/api/trainer/weekly-charts', {
                credentials: 'include',
                cache: 'no-store'
            });

            const data = await response.json();

            if (!response.ok) {
                throw new Error(data.error || 'Failed to fetch weekly charts');
            }

            setClients(data.clients || []);
        } catch (error: any) {
            console.error('Error fetching weekly charts:', error);
            showToast(`Failed to load weekly charts: ${error.message}`, 'error');
        } finally {
            setLoading(false);
        }
    };

    const handleCreateChart = (client: Client) => {
        setSelectedClient(client);
        setEditingChart(null);
        setChartForm({
            week_number: '',
            chart_type: 'workout',
            title: '',
            content: '',
            file_url: ''
        });
        setSelectedFile(null);
        setPreviewUrl(null);
        if (fileInputRef.current) {
            fileInputRef.current.value = '';
        }
        setShowChartModal(true);
    };

    const handleEditChart = (client: Client, chart: WeeklyChart) => {
        setSelectedClient(client);
        setEditingChart(chart);
        setChartForm({
            week_number: chart.week_number.toString(),
            chart_type: chart.chart_type,
            title: chart.title || '',
            content: chart.content || '',
            file_url: chart.file_url || ''
        });
        setSelectedFile(null);
        setPreviewUrl(chart.file_url || null);
        if (fileInputRef.current) {
            fileInputRef.current.value = '';
        }
        setShowChartModal(true);
    };

    const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;

        // Validate file type
        const allowedTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp', 'image/gif', 'application/pdf'];
        if (!allowedTypes.includes(file.type)) {
            showToast('Please select an image (JPEG, PNG, WebP, GIF) or PDF file', 'error');
            return;
        }

        // Validate file size (10MB)
        if (file.size > 10 * 1024 * 1024) {
            showToast('File size must be less than 10MB', 'error');
            return;
        }

        setSelectedFile(file);

        // Create preview for images
        if (file.type.startsWith('image/')) {
            const reader = new FileReader();
            reader.onloadend = () => {
                setPreviewUrl(reader.result as string);
            };
            reader.readAsDataURL(file);
        } else {
            setPreviewUrl(null);
        }
    };

    const handleRemoveFile = () => {
        setSelectedFile(null);
        setPreviewUrl(editingChart?.file_url || null);
        if (fileInputRef.current) {
            fileInputRef.current.value = '';
        }
    };

    const handleSubmitChart = async (e: React.FormEvent) => {
        e.preventDefault();

        if (!selectedClient || !chartForm.week_number) {
            showToast('Please fill in all required fields', 'error');
            return;
        }

        try {
            let fileUrl = chartForm.file_url;

            // Upload file if a new file is selected
            if (selectedFile) {
                setUploadingFile(true);
                const formData = new FormData();
                formData.append('file', selectedFile);
                if (editingChart?.file_url) {
                    formData.append('oldImageUrl', editingChart.file_url);
                }

                const uploadResponse = await fetch('/api/trainer/weekly-charts/upload-image', {
                    method: 'POST',
                    credentials: 'include',
                    body: formData
                });

                const uploadData = await uploadResponse.json();

                if (!uploadResponse.ok || !uploadData.success) {
                    throw new Error(uploadData.error || 'Failed to upload file');
                }

                fileUrl = uploadData.fileUrl;
                setUploadingFile(false);
            }

            const url = editingChart
                ? `/api/trainer/weekly-charts/${editingChart.id}`
                : '/api/trainer/weekly-charts';
            const method = editingChart ? 'PUT' : 'POST';

            const response = await fetch(url, {
                method,
                headers: { 'Content-Type': 'application/json' },
                credentials: 'include',
                body: JSON.stringify({
                    membership_id: selectedClient.membership_id,
                    week_number: parseInt(chartForm.week_number),
                    chart_type: chartForm.chart_type,
                    title: chartForm.title || null,
                    content: chartForm.content || null,
                    file_url: fileUrl || null
                })
            });

            const data = await response.json();

            if (!response.ok) {
                throw new Error(data.error || 'Failed to save chart');
            }

            showToast(
                editingChart ? 'Chart updated successfully!' : 'Chart created successfully!',
                'success'
            );
            setShowChartModal(false);
            setSelectedFile(null);
            setPreviewUrl(null);
            if (fileInputRef.current) {
                fileInputRef.current.value = '';
            }
            fetchClientsAndCharts();
        } catch (error: any) {
            console.error('Error saving chart:', error);
            setUploadingFile(false);
            showToast(`Failed to save chart: ${error.message}`, 'error');
        }
    };

    const handleDeleteChart = async (chartId: number) => {
        if (!confirm('Are you sure you want to delete this chart? This action cannot be undone.')) {
            return;
        }

        try {
            const response = await fetch(`/api/trainer/weekly-charts/${chartId}`, {
                method: 'DELETE',
                credentials: 'include'
            });

            const data = await response.json();

            if (!response.ok) {
                throw new Error(data.error || 'Failed to delete chart');
            }

            showToast('Chart deleted successfully!', 'success');
            fetchClientsAndCharts();
        } catch (error: any) {
            console.error('Error deleting chart:', error);
            showToast(`Failed to delete chart: ${error.message}`, 'error');
        }
    };

    const handleGenerateAIChart = (client: Client) => {
        setSelectedClient(client);
        // Calculate suggested week number (current week or next week)
        const suggestedWeek = client.start_date ? calculateCurrentWeek(client.start_date) : 1;
        setAiForm({
            week_number: suggestedWeek ? suggestedWeek.toString() : '1',
            chart_type: 'workout'
        });
        setShowAIModal(true);
    };

    const handleSubmitAIGeneration = async (e: React.FormEvent) => {
        e.preventDefault();

        if (!selectedClient || !aiForm.week_number) {
            showToast('Please fill in all required fields', 'error');
            return;
        }

        try {
            setGeneratingAI(true);
            const response = await fetch('/api/trainer/weekly-charts/generate-ai', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                credentials: 'include',
                body: JSON.stringify({
                    membership_id: selectedClient.membership_id,
                    week_number: parseInt(aiForm.week_number),
                    chart_type: aiForm.chart_type
                })
            });

            const data = await response.json();

            if (!response.ok) {
                throw new Error(data.error || 'Failed to generate chart using AI');
            }

            showToast('Chart generated successfully using AI!', 'success');
            setShowAIModal(false);
            setAiForm({ week_number: '', chart_type: 'workout' });
            fetchClientsAndCharts();
        } catch (error: any) {
            console.error('Error generating AI chart:', error);
            showToast(`Failed to generate chart: ${error.message}`, 'error');
        } finally {
            setGeneratingAI(false);
        }
    };

    // Group clients by user_id
    const userGroups = useMemo(() => {
        const grouped = new Map<string, {
            user_id: string;
            user_name: string;
            user_email: string;
            memberships: Client[];
        }>();

        clients.forEach(client => {
            const userId = client.user_id;
            if (!grouped.has(userId)) {
                grouped.set(userId, {
                    user_id: userId,
                    user_name: client.user_name,
                    user_email: client.user_email,
                    memberships: []
                });
            }
            grouped.get(userId)!.memberships.push(client);
        });

        return Array.from(grouped.values()).sort((a, b) =>
            b.memberships[0].membership_id - a.memberships[0].membership_id
        );
    }, [clients]);

    // Pagination
    const totalPages = Math.ceil(userGroups.length / itemsPerPage);
    const paginatedUserGroups = userGroups.slice(
        (currentPage - 1) * itemsPerPage,
        currentPage * itemsPerPage
    );

    const toggleUserExpanded = (userId: string) => {
        setExpandedUsers(prev => {
            const newSet = new Set(prev);
            if (newSet.has(userId)) {
                newSet.delete(userId);
            } else {
                newSet.add(userId);
            }
            return newSet;
        });
    };

    // Calculate the current week number based on membership start date
    const calculateCurrentWeek = (startDate: string | null): number | null => {
        if (!startDate) return null;
        const start = new Date(startDate);
        const now = new Date();

        // If start date is in the future, membership hasn't started yet
        if (start.getTime() > now.getTime()) {
            return null;
        }

        const diffTime = now.getTime() - start.getTime();
        const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));
        const weekNumber = Math.floor(diffDays / 7) + 1;

        // Ensure week number is at least 1
        return Math.max(1, weekNumber);
    };

    // Check if a chart exists for a specific week and type
    // This function properly handles type conversion and ensures accurate matching
    const hasChartForWeek = useCallback((weekNumber: number, chartType: string, client: Client): boolean => {
        if (!client.charts || client.charts.length === 0) {
            return false;
        }

        const hasChart = client.charts.some(
            (chart: WeeklyChart) => {
                const weekMatch = chart.week_number === weekNumber;
                const typeMatch = chart.chart_type === chartType;

                if (weekMatch && typeMatch) {
                    console.log(`[TRAINER CHART CHECK] ✓ Found ${chartType} chart for client ${client.membership_id}, week ${weekNumber}`, {
                        chartId: chart.id,
                        chartWeek: chart.week_number,
                        chartType: chart.chart_type
                    });
                }

                return weekMatch && typeMatch;
            }
        );

        return hasChart;
    }, []);

    // Get the current week number that needs a chart for a client (if missing)
    // Only shows reminder if we're actually in that week and chart is missing
    const getNextWeekNeedingChart = useCallback((client: Client): { week: number; types: string[] } | null => {
        if (!client.start_date || client.status !== 'active') {
            return null;
        }

        const currentWeek = calculateCurrentWeek(client.start_date);

        // If membership hasn't started yet, don't show reminder
        if (currentWeek === null) {
            return null;
        }

        // Get all charts for this week
        const chartsForThisWeek = client.charts.filter(c => c.week_number === currentWeek);

        // Check if current week's charts are missing
        const missingTypes: string[] = [];

        const hasWorkout = chartsForThisWeek.some(c => c.chart_type === 'workout');
        const hasDiet = chartsForThisWeek.some(c => c.chart_type === 'diet');

        // Basic plan only includes workout, not diet
        const isBasicPlan = client.plan_name.toLowerCase() === 'basic';

        // Always check for workout chart
        if (!hasWorkout) {
            missingTypes.push('workout');
        }

        // Only check for diet chart if it's NOT a basic plan (premium/elite include diet)
        if (!isBasicPlan && !hasDiet) {
            missingTypes.push('diet');
        }

        // Show reminder if at least one required chart type is missing for current week
        if (missingTypes.length > 0) {
            console.log(`[TRAINER MISSING CHART CHECK] ⚠️ REMINDER: Client ${client.membership_id} (${client.plan_name}), Week ${currentWeek}, Missing: ${missingTypes.join(', ')}`);
            return { week: currentWeek, types: missingTypes };
        }

        console.log(`[TRAINER MISSING CHART CHECK] ✓ NO REMINDER: Client ${client.membership_id} (${client.plan_name}), Week ${currentWeek} - All required charts present`);
        return null;
    }, [hasChartForWeek]);

    if (loading) {
        return (
            <div className={styles.container}>
                <div className={styles.loadingState}>
                    <div className={styles.spinner}></div>
                    <p>Loading weekly charts...</p>
                </div>
            </div>
        );
    }

    return (
        <div className={styles.container}>
            <div className={styles.header}>
                <h1 className={styles.title}>Weekly Charts Management</h1>
                <p className={styles.subtitle}>
                    Create and manage workout and diet charts for your clients
                </p>
            </div>

            {userGroups.length === 0 ? (
                <div className={cardStyles.emptyState}>
                    <FileText className={cardStyles.emptyStateIcon} />
                    <div className={cardStyles.emptyStateTitle}>No clients assigned</div>
                    <div className={cardStyles.emptyStateText}>
                        Weekly charts will appear here once you have clients with active memberships.
                    </div>
                </div>
            ) : (
                <>
                    <div className={styles.cardsContainer}>
                        {paginatedUserGroups.map((userGroup) => {
                            const isExpanded = expandedUsers.has(userGroup.user_id);
                            const totalCharts = userGroup.memberships.reduce((sum, m) => sum + m.charts.length, 0);
                            const workoutCharts = userGroup.memberships.reduce((sum, m) => sum + m.charts.filter(c => c.chart_type === 'workout').length, 0);
                            const dietCharts = userGroup.memberships.reduce((sum, m) => sum + m.charts.filter(c => c.chart_type === 'diet').length, 0);

                            return (
                                <div key={userGroup.user_id} className={cardStyles.userCard}>
                                    <div
                                        className={`${cardStyles.userCardHeader} ${isExpanded ? cardStyles.userCardHeaderExpanded : ''}`}
                                        onClick={() => toggleUserExpanded(userGroup.user_id)}
                                    >
                                        <div className={cardStyles.userInfo}>
                                            <div className={cardStyles.userAvatar}>
                                                {userGroup.user_name.charAt(0).toUpperCase()}
                                            </div>
                                            <div className={cardStyles.userDetails}>
                                                <div className={cardStyles.userName}>{userGroup.user_name}</div>
                                                <div className={cardStyles.userEmail}>
                                                    {userGroup.user_email} • {userGroup.memberships.length} Plan{userGroup.memberships.length > 1 ? 's' : ''}
                                                </div>
                                            </div>
                                        </div>
                                        <div className={cardStyles.userStats}>
                                            <div className={cardStyles.statItem}>
                                                <div className={cardStyles.statValue}>{totalCharts}</div>
                                                <div className={cardStyles.statLabel}>Total Charts</div>
                                            </div>
                                            {workoutCharts > 0 && (
                                                <div className={cardStyles.statItem}>
                                                    <div className={cardStyles.statValue} style={{ color: '#3b82f6' }}>
                                                        {workoutCharts}
                                                    </div>
                                                    <div className={cardStyles.statLabel}>Workout</div>
                                                </div>
                                            )}
                                            {dietCharts > 0 && (
                                                <div className={cardStyles.statItem}>
                                                    <div className={cardStyles.statValue} style={{ color: '#10b981' }}>
                                                        {dietCharts}
                                                    </div>
                                                    <div className={cardStyles.statLabel}>Diet</div>
                                                </div>
                                            )}
                                        </div>
                                        <ChevronDown
                                            className={`${cardStyles.expandIcon} ${isExpanded ? cardStyles.expandIconExpanded : ''}`}
                                        />
                                    </div>

                                    <div className={`${cardStyles.userCardContent} ${isExpanded ? cardStyles.userCardContentExpanded : ''}`}>
                                        <div className={cardStyles.itemsList}>
                                            {userGroup.memberships.map((membership) => {
                                                const nextWeekInfo = getNextWeekNeedingChart(membership);
                                                return (
                                                    <div key={membership.membership_id} style={{ marginBottom: '1.5rem' }}>
                                                        {/* Next Week Chart Reminder Card */}
                                                        {nextWeekInfo && (
                                                            <div className={styles.reminderCard} style={{ marginBottom: '1rem' }}>
                                                                <div className={styles.reminderIcon}>
                                                                    <Clock size={18} />
                                                                </div>
                                                                <div className={styles.reminderContent}>
                                                                    <div className={styles.reminderTitle}>
                                                                        Week {nextWeekInfo.week} Chart Missing
                                                                    </div>
                                                                    <div className={styles.reminderText}>
                                                                        {nextWeekInfo.types.length === 1 ? (
                                                                            <>
                                                                                <strong>{nextWeekInfo.types[0] === 'workout' ? 'Workout' : 'Diet'}</strong> chart needed for Week {nextWeekInfo.week}
                                                                            </>
                                                                        ) : (
                                                                            <>
                                                                                <strong>Workout and Diet</strong> charts needed for Week {nextWeekInfo.week}
                                                                            </>
                                                                        )}
                                                                    </div>
                                                                </div>
                                                                    <div style={{ display: 'flex', gap: '0.5rem' }}>
                                                                        <button
                                                                            onClick={(e) => {
                                                                                e.stopPropagation();
                                                                                handleGenerateAIChart(membership);
                                                                            }}
                                                                            className={`${cardStyles.actionButton}`}
                                                                            style={{ 
                                                                                background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
                                                                                color: 'white',
                                                                                border: 'none',
                                                                                whiteSpace: 'nowrap'
                                                                            }}
                                                                            title="Generate chart using AI based on user's form data"
                                                                        >
                                                                            <Sparkles size={16} />
                                                                            AI Generate
                                                                        </button>
                                                                <button
                                                                    onClick={(e) => {
                                                                        e.stopPropagation();
                                                                        handleCreateChart(membership);
                                                                    }}
                                                                    className={`${cardStyles.actionButton} ${cardStyles.actionButtonPrimary}`}
                                                                    style={{ whiteSpace: 'nowrap' }}
                                                                >
                                                                    <Plus size={16} />
                                                                    Add Now
                                                                </button>
                                                                    </div>
                                                            </div>
                                                        )}

                                                        <div className={cardStyles.itemCard}>
                                                            <div className={cardStyles.itemHeader}>
                                                                <div>
                                                                    <div className={cardStyles.itemTitle}>
                                                                        {membership.plan_name.charAt(0).toUpperCase() + membership.plan_name.slice(1)} Plan
                                                                    </div>
                                                                    <div className={cardStyles.itemMeta}>
                                                                        <span className={cardStyles.itemBadge} style={{
                                                                            background: '#e0e7ff',
                                                                            color: '#3730a3'
                                                                        }}>
                                                                            {membership.charts.length} Chart{membership.charts.length !== 1 ? 's' : ''}
                                                                        </span>
                                                                    </div>
                                                                </div>
                                                                    <div style={{ display: 'flex', gap: '0.5rem', marginLeft: 'auto' }}>
                                                                        <button
                                                                            onClick={(e) => {
                                                                                e.stopPropagation();
                                                                                handleGenerateAIChart(membership);
                                                                            }}
                                                                            className={`${cardStyles.actionButton}`}
                                                                            style={{ 
                                                                                background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
                                                                                color: 'white',
                                                                                border: 'none'
                                                                            }}
                                                                            title="Generate chart using AI based on user's form data"
                                                                        >
                                                                            <Sparkles size={16} />
                                                                            AI Generate
                                                                        </button>
                                                                <button
                                                                    onClick={(e) => {
                                                                        e.stopPropagation();
                                                                        handleCreateChart(membership);
                                                                    }}
                                                                    className={`${cardStyles.actionButton} ${cardStyles.actionButtonPrimary}`}
                                                                >
                                                                    <Plus size={16} />
                                                                    Add Chart
                                                                </button>
                                                                    </div>
                                                            </div>

                                                            {membership.charts.length === 0 ? (
                                                                <div className={cardStyles.emptyState} style={{ padding: '1.5rem 1rem', marginTop: '1rem' }}>
                                                                    <FileText className={cardStyles.emptyStateIcon} style={{ width: '24px', height: '24px' }} />
                                                                    <div className={cardStyles.emptyStateText} style={{ fontSize: '0.875rem' }}>
                                                                        No charts for this plan yet.
                                                                    </div>
                                                                </div>
                                                            ) : (
                                                                <div style={{ marginTop: '1rem' }}>
                                                                    {membership.charts.map((chart) => (
                                                                        <div key={chart.id} className={cardStyles.itemCard} style={{ marginBottom: '0.75rem' }}>
                                                                            <div className={cardStyles.itemHeader}>
                                                                                <div>
                                                                                    <div className={cardStyles.itemTitle}>
                                                                                        Week {chart.week_number} - {chart.chart_type === 'workout' ? 'Workout Plan' : 'Diet Plan'}
                                                                                    </div>
                                                                                    <div className={cardStyles.itemMeta}>
                                                                                        <span className={cardStyles.itemBadge} style={{
                                                                                            background: chart.chart_type === 'workout' ? '#dbeafe' : '#d1fae5',
                                                                                            color: chart.chart_type === 'workout' ? '#1e40af' : '#065f46'
                                                                                        }}>
                                                                                            {chart.chart_type === 'workout' ? 'Workout' : 'Diet'}
                                                                                        </span>
                                                                                        <span>•</span>
                                                                                        <span>{new Date(chart.created_at).toLocaleDateString()}</span>
                                                                                    </div>
                                                                                </div>
                                                                            </div>

                                                                            {chart.title && (
                                                                                <div className={cardStyles.itemDetails}>
                                                                                    <div className={cardStyles.detailRow}>
                                                                                        <div className={cardStyles.detailLabel}>Title</div>
                                                                                        <div className={cardStyles.detailValue}>{chart.title}</div>
                                                                                    </div>
                                                                                </div>
                                                                            )}

                                                                            {chart.content && (
                                                                                <div className={cardStyles.itemDetails}>
                                                                                    <div className={cardStyles.detailRow}>
                                                                                        <div className={cardStyles.detailLabel}>Content</div>
                                                                                        <div className={cardStyles.detailValue} style={{
                                                                                            maxHeight: '100px',
                                                                                            overflow: 'auto',
                                                                                            whiteSpace: 'pre-wrap'
                                                                                        }}>
                                                                                            {chart.content}
                                                                                        </div>
                                                                                    </div>
                                                                                </div>
                                                                            )}

                                                                            <div className={cardStyles.itemActions}>
                                                                                {chart.file_url && (
                                                                                    <a
                                                                                        href={chart.file_url}
                                                                                        target="_blank"
                                                                                        rel="noopener noreferrer"
                                                                                        className={`${cardStyles.actionButton} ${cardStyles.actionButtonSecondary}`}
                                                                                    >
                                                                                        <Download size={16} />
                                                                                        Download File
                                                                                    </a>
                                                                                )}
                                                                                <button
                                                                                    onClick={(e) => {
                                                                                        e.stopPropagation();
                                                                                        handleEditChart(membership, chart);
                                                                                    }}
                                                                                    className={`${cardStyles.actionButton} ${cardStyles.actionButtonSecondary}`}
                                                                                >
                                                                                    <Edit size={16} />
                                                                                    Edit
                                                                                </button>
                                                                                <button
                                                                                    onClick={(e) => {
                                                                                        e.stopPropagation();
                                                                                        handleDeleteChart(chart.id);
                                                                                    }}
                                                                                    className={`${cardStyles.actionButton} ${cardStyles.actionButtonDanger}`}
                                                                                >
                                                                                    <Trash2 size={16} />
                                                                                    Delete
                                                                                </button>
                                                                            </div>
                                                                        </div>
                                                                    ))}
                                                                </div>
                                                            )}
                                                        </div>
                                                    </div>
                                                );
                                            })}
                                        </div>
                                    </div>
                                </div>
                            );
                        })}
                    </div>

                    {/* Pagination */}
                    {totalPages > 1 && (
                        <div className={cardStyles.pagination}>
                            <button
                                className={cardStyles.paginationButton}
                                onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
                                disabled={currentPage === 1}
                            >
                                ‹
                            </button>
                            {Array.from({ length: totalPages }, (_, i) => i + 1).map(page => (
                                <button
                                    key={page}
                                    className={`${cardStyles.paginationButton} ${currentPage === page ? cardStyles.paginationButtonActive : ''}`}
                                    onClick={() => setCurrentPage(page)}
                                >
                                    {page}
                                </button>
                            ))}
                            <button
                                className={cardStyles.paginationButton}
                                onClick={() => setCurrentPage(prev => Math.min(totalPages, prev + 1))}
                                disabled={currentPage === totalPages}
                            >
                                ›
                            </button>
                            <div className={cardStyles.paginationInfo}>
                                Page {currentPage} of {totalPages} ({userGroups.length} clients)
                            </div>
                        </div>
                    )}
                </>
            )}

            {/* Chart Modal */}
            {showChartModal && selectedClient && (
                <div className={styles.modalOverlay} onClick={() => setShowChartModal(false)}>
                    <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
                        <div className={styles.modalHeader}>
                            <h2>{editingChart ? 'Edit Chart' : 'Create New Chart'}</h2>
                            <button
                                className={styles.modalClose}
                                onClick={() => setShowChartModal(false)}
                            >
                                <X size={20} />
                            </button>
                        </div>

                        <form onSubmit={handleSubmitChart} className={styles.modalBody}>
                            <div className={styles.formGroup}>
                                <label htmlFor="week_number">Week Number *</label>
                                <input
                                    type="number"
                                    id="week_number"
                                    value={chartForm.week_number}
                                    onChange={(e) => setChartForm(prev => ({ ...prev, week_number: e.target.value }))}
                                    min="1"
                                    required
                                    disabled={!!editingChart}
                                />
                            </div>

                            <div className={styles.formGroup}>
                                <label htmlFor="chart_type">Chart Type *</label>
                                <select
                                    id="chart_type"
                                    value={chartForm.chart_type}
                                    onChange={(e) => setChartForm(prev => ({ ...prev, chart_type: e.target.value }))}
                                    required
                                    disabled={!!editingChart}
                                >
                                    <option value="workout">Workout Plan</option>
                                    <option value="diet">Diet Plan</option>
                                </select>
                            </div>

                            <div className={styles.formGroup}>
                                <label htmlFor="title">Title</label>
                                <input
                                    type="text"
                                    id="title"
                                    value={chartForm.title}
                                    onChange={(e) => setChartForm(prev => ({ ...prev, title: e.target.value }))}
                                    placeholder="e.g., Strength Training Week 1"
                                />
                            </div>

                            <div className={styles.formGroup}>
                                <label htmlFor="content">Content</label>
                                <textarea
                                    id="content"
                                    value={chartForm.content}
                                    onChange={(e) => setChartForm(prev => ({ ...prev, content: e.target.value }))}
                                    rows={6}
                                    placeholder="Enter chart details, exercises, meal plans, etc."
                                />
                            </div>

                            <div className={styles.formGroup}>
                                <label htmlFor="file_upload">Upload Chart Image/File (Optional)</label>
                                <div className={styles.fileUploadContainer}>
                                    <input
                                        ref={fileInputRef}
                                        type="file"
                                        id="file_upload"
                                        accept="image/*,.pdf"
                                        onChange={handleFileSelect}
                                        className={styles.fileInput}
                                    />
                                    <label htmlFor="file_upload" className={styles.fileInputLabel}>
                                        <Upload size={18} />
                                        {selectedFile ? selectedFile.name : 'Choose File'}
                                    </label>
                                    {selectedFile && (
                                        <button
                                            type="button"
                                            onClick={handleRemoveFile}
                                            className={styles.removeFileButton}
                                        >
                                            <X size={16} />
                                        </button>
                                    )}
                                </div>
                                {previewUrl && (
                                    <div className={styles.previewContainer}>
                                        {previewUrl.startsWith('data:') || previewUrl.match(/\.(jpg|jpeg|png|gif|webp)$/i) ? (
                                            <img src={previewUrl} alt="Preview" className={styles.previewImage} />
                                        ) : (
                                            <div className={styles.previewFile}>
                                                <FileText size={24} />
                                                <a href={previewUrl} target="_blank" rel="noopener noreferrer" className={styles.previewLink}>
                                                    View Current File
                                                </a>
                                            </div>
                                        )}
                                    </div>
                                )}
                                <small className={styles.helpText}>
                                    Upload an image (JPEG, PNG, WebP, GIF) or PDF file (Max 10MB)
                                </small>
                            </div>

                            <div className={styles.modalFooter}>
                                <button
                                    type="button"
                                    className={styles.cancelButton}
                                    onClick={() => setShowChartModal(false)}
                                    disabled={uploadingFile}
                                >
                                    Cancel
                                </button>
                                <button
                                    type="submit"
                                    className={styles.submitButton}
                                    disabled={uploadingFile}
                                >
                                    {uploadingFile ? 'Uploading...' : (editingChart ? 'Update Chart' : 'Create Chart')}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {/* AI Generation Modal */}
            {showAIModal && selectedClient && (
                <div className={styles.modalOverlay} onClick={() => setShowAIModal(false)}>
                    <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
                        <div className={styles.modalHeader}>
                            <h2>Generate Chart Using AI</h2>
                            <button
                                className={styles.modalClose}
                                onClick={() => setShowAIModal(false)}
                                disabled={generatingAI}
                            >
                                <X size={20} />
                            </button>
                        </div>

                        <form onSubmit={handleSubmitAIGeneration} className={styles.modalBody}>
                            <div style={{ 
                                padding: '1rem', 
                                background: '#f0f9ff', 
                                borderRadius: '0.5rem', 
                                marginBottom: '1.5rem',
                                border: '1px solid #bae6fd'
                            }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.5rem' }}>
                                    <Sparkles size={18} style={{ color: '#667eea' }} />
                                    <strong style={{ color: '#1e40af' }}>AI-Powered Chart Generation</strong>
                                </div>
                                <p style={{ fontSize: '0.875rem', color: '#1e40af', margin: 0 }}>
                                    The AI will analyze the client's membership form data (health goals, medical conditions, 
                                    dietary preferences, activity level, etc.) to create a personalized {aiForm.chart_type} chart 
                                    for Week {aiForm.week_number || '?'}.
                                </p>
                            </div>

                            <div className={styles.formGroup}>
                                <label htmlFor="ai_week_number">Week Number *</label>
                                <input
                                    type="number"
                                    id="ai_week_number"
                                    value={aiForm.week_number}
                                    onChange={(e) => setAiForm(prev => ({ ...prev, week_number: e.target.value }))}
                                    min="1"
                                    required
                                    disabled={generatingAI}
                                />
                                <small className={styles.helpText}>
                                    Suggested: Week {selectedClient.start_date ? calculateCurrentWeek(selectedClient.start_date) || 1 : 1}
                                </small>
                            </div>

                            <div className={styles.formGroup}>
                                <label htmlFor="ai_chart_type">Chart Type *</label>
                                <select
                                    id="ai_chart_type"
                                    value={aiForm.chart_type}
                                    onChange={(e) => setAiForm(prev => ({ ...prev, chart_type: e.target.value }))}
                                    required
                                    disabled={generatingAI}
                                >
                                    <option value="workout">Workout Plan</option>
                                    <option value="diet">Diet Plan</option>
                                </select>
                                <small className={styles.helpText}>
                                    {selectedClient.plan_name.toLowerCase() === 'basic' && aiForm.chart_type === 'diet' && 
                                        'Note: Basic plans typically only include workout charts.'}
                                </small>
                            </div>

                            <div style={{ 
                                padding: '1rem', 
                                background: '#fef3c7', 
                                borderRadius: '0.5rem', 
                                marginTop: '1rem',
                                border: '1px solid #fcd34d'
                            }}>
                                <div style={{ fontSize: '0.875rem', color: '#92400e' }}>
                                    <strong>⚠️ Important:</strong>
                                    <ul style={{ marginTop: '0.5rem', paddingLeft: '1.5rem' }}>
                                        <li>Ensure the client has submitted their membership application form with complete information</li>
                                        <li>The AI will use all available form data to personalize the chart</li>
                                        <li>Review the generated chart before it's sent to the client</li>
                                        <li>Generation may take 10-30 seconds</li>
                                    </ul>
                                </div>
                            </div>

                            <div className={styles.modalFooter}>
                                <button
                                    type="button"
                                    className={styles.cancelButton}
                                    onClick={() => setShowAIModal(false)}
                                    disabled={generatingAI}
                                >
                                    Cancel
                                </button>
                                <button
                                    type="submit"
                                    className={styles.submitButton}
                                    disabled={generatingAI}
                                    style={{
                                        background: generatingAI ? '#9ca3af' : 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
                                        border: 'none'
                                    }}
                                >
                                    {generatingAI ? (
                                        <>
                                            <div className={styles.spinnerSmall} style={{ marginRight: '0.5rem' }}></div>
                                            Generating...
                                        </>
                                    ) : (
                                        <>
                                            <Sparkles size={18} style={{ marginRight: '0.5rem' }} />
                                            Generate Chart
                                        </>
                                    )}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            <Toast message={toast} type={toastType} onClose={hideToast} />
        </div>
    );
}

