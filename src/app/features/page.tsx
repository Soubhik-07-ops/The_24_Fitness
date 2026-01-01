import GymBenefits from '@/components/GymBenefits/GymBenefits'
import Footer from '@/components/Footer/Footer'
import Navbar from '@/components/Navbar/Navbar'
import { Metadata } from 'next'

export const metadata: Metadata = {
    title: 'Gym Benefits - Discover The 24 Fitness Gym',
    description: 'Train smarter, recover better, and unlock your full potential with world-class facilities and expert trainers.',
}

export default function FeaturesPage() {
    return (
        <>
            <Navbar />
            <main>
                <GymBenefits />
            </main>
            <Footer />
        </>
    )
}