'use client'

import { useEffect, useState } from 'react'
import styles from './Toast.module.css'

interface ToastProps {
    message: string | null
    type?: 'success' | 'error' | 'info' | 'warning'
    duration?: number
    onClose?: () => void
}

export default function Toast({ message, type = 'info', duration = 3000, onClose }: ToastProps) {
    const [isVisible, setIsVisible] = useState(false)

    useEffect(() => {
        if (message) {
            setIsVisible(true)
            const timer = setTimeout(() => {
                setIsVisible(false)
                setTimeout(() => {
                    onClose?.()
                }, 300) // Wait for animation to complete
            }, duration)
            return () => clearTimeout(timer)
        } else {
            setIsVisible(false)
        }
    }, [message, duration, onClose])

    if (!message) return null

    return (
        <div className={`${styles.toast} ${styles[type]} ${isVisible ? styles.visible : ''}`}>
            {message}
        </div>
    )
}

