'use client'

import { useState, useCallback } from 'react'

export type ToastType = 'success' | 'error' | 'info' | 'warning'

interface ToastState {
    message: string | null
    type: ToastType
}

export function useToast() {
    const [toast, setToast] = useState<ToastState>({ message: null, type: 'info' })

    const showToast = useCallback((message: string, type: ToastType = 'info') => {
        setToast({ message, type })
    }, [])

    const hideToast = useCallback(() => {
        setToast({ message: null, type: 'info' })
    }, [])

    return {
        toast: toast.message,
        toastType: toast.type,
        showToast,
        hideToast
    }
}

