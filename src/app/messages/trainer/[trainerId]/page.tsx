'use client';

import { useState, useEffect } from 'react';
import { useParams } from 'next/navigation';
import Navbar from '@/components/Navbar/Navbar';
import Footer from '@/components/Footer/Footer';
import TrainerChatWindow from '@/components/TrainerChat/TrainerChatWindow';
import styles from './page.module.css';

export default function UserTrainerChatPage() {
    const params = useParams();
    const trainerId = params?.trainerId as string;
    const [trainerName, setTrainerName] = useState('Trainer');

    useEffect(() => {
        fetchTrainerInfo();
    }, [trainerId]);

    const fetchTrainerInfo = async () => {
        try {
            const response = await fetch('/api/trainers');
            const data = await response.json();
            const trainer = data.trainers?.find((t: any) => t.id === trainerId);
            if (trainer) {
                setTrainerName(trainer.name);
            }
        } catch (error) {
            console.error('Error fetching trainer info:', error);
        }
    };

    return (
        <>
            <Navbar />
            <main className={styles.page}>
                <div className={styles.container}>
                    <h1 className={styles.title}>Chat with Your Trainer</h1>
                    <TrainerChatWindow trainerId={trainerId} trainerName={trainerName} />
                </div>
            </main>
            <Footer />
        </>
    );
}

