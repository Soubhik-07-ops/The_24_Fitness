// src/types/review.ts
export interface Review {
    classes?: any;
    id: number | string;
    created_at: string;
    updated_at: string;
    user_id: string;
    class_id: number | string | null;
    rating: number;
    comment: string | null;
    is_approved: boolean;
    profiles?: {
        full_name: string | null;
        avatar_url: string | null;
    };
}

export interface ReviewStats {
    average_rating: number;
    total_reviews: number;
    rating_distribution: {
        1: number;
        2: number;
        3: number;
        4: number;
        5: number;
    };
}

export interface ReviewFormData {
    rating: number;
    comment: string;
}