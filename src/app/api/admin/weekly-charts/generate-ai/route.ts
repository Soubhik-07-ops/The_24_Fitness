// src/app/api/admin/weekly-charts/generate-ai/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { validateAdminSession } from '@/lib/adminAuth';
import { getChartResponsibility, needsWorkoutCharts, needsDietCharts } from '@/lib/chartResponsibility';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const openRouterApiKey = process.env.OPENROUTER_API_KEY;

const supabaseAdmin = createClient(supabaseUrl || '', supabaseServiceKey || '', {
    auth: { autoRefreshToken: false, persistSession: false }
});

// POST: Generate chart using AI
export async function POST(request: NextRequest) {
    try {
        const token = request.cookies.get('admin_token')?.value;
        if (!token) {
            return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
        }

        const admin = await validateAdminSession(token);
        if (!admin) {
            return NextResponse.json({ error: 'Invalid or expired admin session' }, { status: 401 });
        }

        if (!openRouterApiKey) {
            return NextResponse.json(
                { error: 'OpenRouter API key not configured. Please set OPENROUTER_API_KEY in environment variables.' },
                { status: 500 }
            );
        }

        const body = await request.json();
        const { membership_id, week_number, chart_type } = body;

        if (!membership_id || !week_number || !chart_type) {
            return NextResponse.json(
                { error: 'membership_id, week_number, and chart_type are required' },
                { status: 400 }
            );
        }

        // Validate chart_type
        if (chart_type !== 'workout' && chart_type !== 'diet') {
            return NextResponse.json(
                { error: 'chart_type must be either "workout" or "diet"' },
                { status: 400 }
            );
        }

        // Fetch membership with form_data
        const { data: membership, error: membershipError } = await supabaseAdmin
            .from('memberships')
            .select(`
                id,
                status,
                user_id,
                plan_name,
                plan_type,
                plan_mode,
                trainer_period_end,
                membership_start_date,
                start_date,
                membership_end_date,
                end_date,
                form_data,
                membership_addons!left (
                    addon_type,
                    status
                )
            `)
            .eq('id', membership_id)
            .single();

        if (membershipError || !membership) {
            return NextResponse.json(
                { error: 'Membership not found' },
                { status: 404 }
            );
        }

        // Check if membership is active
        if (membership.status !== 'active') {
            return NextResponse.json(
                { error: 'Membership is not active' },
                { status: 400 }
            );
        }

        // Get addons
        const hasTrainerAddon = (membership.membership_addons || []).some(
            (a: any) => a.addon_type === 'personal_trainer' && (a.status === 'active' || a.status === 'pending')
        );
        const hasInGymAddon = (membership.membership_addons || []).some(
            (a: any) => a.addon_type === 'in_gym' && (a.status === 'active' || a.status === 'pending')
        );

        // Use chart responsibility logic
        const membershipStartDate = membership.membership_start_date || membership.start_date;
        const membershipEndDate = membership.membership_end_date || membership.end_date;
        const trainerPeriodEnd = membership.trainer_period_end ? new Date(membership.trainer_period_end) : null;
        const currentDate = new Date();
        currentDate.setHours(0, 0, 0, 0);

        const chartResp = getChartResponsibility({
            planName: membership.plan_name,
            hasTrainerAddon,
            hasInGymAddon,
            trainerPeriodEnd,
            membershipStartDate: membershipStartDate ? new Date(membershipStartDate) : new Date(),
            membershipEndDate: membershipEndDate ? new Date(membershipEndDate) : new Date(),
            currentDate
        });

        // Check if chart type is allowed
        if (chart_type === 'diet' && !needsDietCharts(membership.plan_name, hasTrainerAddon)) {
            return NextResponse.json(
                { error: 'This plan type does not include diet charts.' },
                { status: 400 }
            );
        }

        if (chart_type === 'workout' && !needsWorkoutCharts(membership.plan_name, hasTrainerAddon)) {
            return NextResponse.json(
                { error: 'This plan type does not include workout charts.' },
                { status: 400 }
            );
        }

        // Check if chart already exists for this week and type
        const { data: existingChart } = await supabaseAdmin
            .from('weekly_charts')
            .select('id')
            .eq('membership_id', membership_id)
            .eq('week_number', week_number)
            .eq('chart_type', chart_type)
            .single();

        if (existingChart) {
            return NextResponse.json(
                { error: 'Chart already exists for this week and type. Please delete it first or use a different week.' },
                { status: 400 }
            );
        }

        // Check if form_data exists
        if (!membership.form_data || typeof membership.form_data !== 'object') {
            return NextResponse.json(
                { error: 'User form data not found. Please ensure the membership application form was submitted.' },
                { status: 400 }
            );
        }

        // Initialize OpenRouter AI (DeepSeek model)
        // Using deepseek/deepseek-r1-0528:free which is available on free tier

        // Prepare user information from form_data
        const formData = membership.form_data;
        const userInfo = {
            name: formData.name || 'User',
            age: formData.age || 'Not specified',
            gender: formData.gender || 'Not specified',
            presentWeight: formData.presentWeight || 'Not specified',
            idealWeight: formData.idealWeight || 'Not specified',
            weightGoal: formData.weightGoal || 'Not specified',
            weightLossGoal: formData.weightLossGoal || 'Not specified',
            weightLossGoalAmount: formData.weightLossGoalAmount || 'Not specified',
            healthGoalsList: formData.healthGoalsList || 'Not specified',
            dietaryGoals: formData.dietaryGoals || 'Not specified',
            eatingPlanType: formData.eatingPlanType || 'Not specified',
            foodAllergies: formData.foodAllergies || 'None',
            foodAllergiesList: formData.foodAllergiesList || 'None',
            medicalConditions: formData.medicalConditions || {},
            pastInjuries: formData.pastInjuries || 'None',
            activityRestrictions: formData.activityRestrictions || [],
            currentMedications: formData.currentMedications || 'None',
            supplements: formData.supplements || 'None',
            supplementsList: formData.supplementsList || 'None',
            sleepHours: formData.sleepHours || 'Not specified',
            waterIntake: formData.waterIntake || 'Not specified',
            workSchedule: formData.workSchedule || 'Not specified',
            workActivityLevel: formData.workActivityLevel || 'Not specified',
            cardioMinutes: formData.cardioMinutes || 'Not specified',
            cardioTimesPerWeek: formData.cardioTimesPerWeek || 'Not specified',
            sportsMinutes: formData.sportsMinutes || 'Not specified',
            sportsActivities: formData.sportsActivities || 'Not specified',
            favoriteActivities: formData.favoriteActivities || 'Not specified',
            exerciseFeelings: formData.exerciseFeelings || 'Not specified',
            stressLevel: formData.stressLevel || 'Not specified',
            familyHistory: formData.familyHistory || {},
            cholesterolChecked: formData.cholesterolChecked || 'Not specified',
            cholesterolResults: formData.cholesterolResults || 'Not specified',
            bloodSugarChecked: formData.bloodSugarChecked || 'Not specified',
            bloodSugarResults: formData.bloodSugarResults || 'Not specified',
            bodyComposition: formData.bodyComposition || 'Not specified',
            hipCircumference: formData.hipCircumference || 'Not specified',
            waistCircumference: formData.waistCircumference || 'Not specified',
            planName: membership.plan_name,
            weekNumber: week_number
        };

        // Create prompt based on chart type
        let prompt = '';

        if (chart_type === 'workout') {
            prompt = `You are a professional fitness trainer creating a personalized workout plan for Week ${week_number}.

User Information:
- Name: ${userInfo.name}
- Age: ${userInfo.age}
- Gender: ${userInfo.gender}
- Current Weight: ${userInfo.presentWeight}
- Ideal Weight: ${userInfo.idealWeight}
- Weight Goal: ${userInfo.weightGoal}
- Health Goals: ${userInfo.healthGoalsList}
- Past Injuries: ${userInfo.pastInjuries}
- Activity Restrictions: ${Array.isArray(userInfo.activityRestrictions) ? userInfo.activityRestrictions.join(', ') : userInfo.activityRestrictions}
- Current Medications: ${userInfo.currentMedications}
- Work Schedule: ${userInfo.workSchedule}
- Work Activity Level: ${userInfo.workActivityLevel}
- Cardio Minutes: ${userInfo.cardioMinutes}
- Cardio Times Per Week: ${userInfo.cardioTimesPerWeek}
- Sports Activities: ${userInfo.sportsActivities}
- Favorite Activities: ${userInfo.favoriteActivities}
- Exercise Feelings: ${userInfo.exerciseFeelings}
- Stress Level: ${userInfo.stressLevel}
- Medical Conditions: ${JSON.stringify(userInfo.medicalConditions)}
- Family History: ${JSON.stringify(userInfo.familyHistory)}

Create a comprehensive, personalized workout plan for Week ${week_number} that:
1. Is safe and appropriate for the user's age, fitness level, and health conditions
2. Takes into account any past injuries or activity restrictions
3. Aligns with their weight goals and health objectives
4. Is progressive and appropriate for Week ${week_number}
5. Includes specific exercises with sets, reps, and rest periods
6. Provides clear instructions for each exercise
7. Considers their work schedule and available time
8. Is motivating and achievable

Format the response as a detailed workout plan with:
- A title for the week
- Daily workout schedule (Monday through Sunday)
- Specific exercises for each day
- Sets, reps, and rest periods
- Notes on form and safety
- Progression tips

Make it practical, safe, and tailored to their specific needs and goals.`;
        } else if (chart_type === 'diet') {
            prompt = `You are a professional nutritionist creating a personalized diet plan for Week ${week_number}.

User Information:
- Name: ${userInfo.name}
- Age: ${userInfo.age}
- Gender: ${userInfo.gender}
- Current Weight: ${userInfo.presentWeight}
- Ideal Weight: ${userInfo.idealWeight}
- Weight Goal: ${userInfo.weightGoal}
- Weight Loss Goal: ${userInfo.weightLossGoal}
- Weight Loss Goal Amount: ${userInfo.weightLossGoalAmount}
- Health Goals: ${userInfo.healthGoalsList}
- Dietary Goals: ${userInfo.dietaryGoals}
- Eating Plan Type: ${userInfo.eatingPlanType}
- Food Allergies: ${userInfo.foodAllergies} ${userInfo.foodAllergiesList ? `(${userInfo.foodAllergiesList})` : ''}
- Medical Conditions: ${JSON.stringify(userInfo.medicalConditions)}
- Current Medications: ${userInfo.currentMedications}
- Supplements: ${userInfo.supplements} ${userInfo.supplementsList ? `(${userInfo.supplementsList})` : ''}
- Sleep Hours: ${userInfo.sleepHours}
- Water Intake: ${userInfo.waterIntake}
- Work Schedule: ${userInfo.workSchedule}
- Stress Level: ${userInfo.stressLevel}
- Family History: ${JSON.stringify(userInfo.familyHistory)}
- Cholesterol Checked: ${userInfo.cholesterolChecked}
- Cholesterol Results: ${userInfo.cholesterolResults}
- Blood Sugar Checked: ${userInfo.bloodSugarChecked}
- Blood Sugar Results: ${userInfo.bloodSugarResults}
- Body Composition: ${userInfo.bodyComposition}

Create a comprehensive, personalized diet plan for Week ${week_number} that:
1. Is safe and appropriate for the user's age, health conditions, and dietary restrictions
2. Takes into account any food allergies or medical conditions
3. Aligns with their weight goals and dietary preferences
4. Is balanced and nutritious
5. Includes specific meal plans for each day (breakfast, lunch, dinner, snacks)
6. Provides portion sizes and nutritional information where relevant
7. Considers their work schedule and lifestyle
8. Is practical and easy to follow
9. Includes hydration recommendations
10. Provides meal timing suggestions

Format the response as a detailed diet plan with:
- A title for the week
- Daily meal schedule (Monday through Sunday)
- Specific meals and snacks for each day
- Portion sizes
- Nutritional notes
- Hydration guidelines
- Meal timing recommendations
- Tips for meal preparation

Make it practical, safe, and tailored to their specific needs, goals, and dietary restrictions.`;
        }

        // Helper function to clean markdown formatting
        const cleanMarkdown = (text: string): string => {
            if (!text) return text;

            // Remove markdown headers (# ## ###)
            text = text.replace(/^#{1,6}\s+/gm, '');

            // Remove bold/italic markers (**text** or *text*)
            text = text.replace(/\*\*([^*]+)\*\*/g, '$1');
            text = text.replace(/\*([^*]+)\*/g, '$1');

            // Remove markdown list markers (- * +)
            text = text.replace(/^[\s]*[-*+]\s+/gm, '');

            // Remove markdown links [text](url)
            text = text.replace(/\[([^\]]+)\]\([^\)]+\)/g, '$1');

            // Remove horizontal rules (---)
            text = text.replace(/^---+$/gm, '');

            // Clean up multiple newlines (more than 2)
            text = text.replace(/\n{3,}/g, '\n\n');

            // Trim whitespace
            return text.trim();
        };

        // Generate chart content using OpenRouter (Xiaomi Mimo)
        const openRouterResponse = await fetch('https://openrouter.ai/api/v1/chat/completions', {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${openRouterApiKey}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                model: 'xiaomi/mimo-v2-flash:free',
                messages: [
                    {
                        role: 'user',
                        content: prompt
                    }
                ],
                reasoning: { enabled: true }
            })
        });

        if (!openRouterResponse.ok) {
            const errorData = await openRouterResponse.json().catch(() => ({}));
            throw new Error(errorData.error?.message || `OpenRouter API error: ${openRouterResponse.statusText}`);
        }

        const openRouterData = await openRouterResponse.json();
        const assistantMessage = openRouterData.choices?.[0]?.message || {};
        let generatedContent = assistantMessage.content || '';

        if (!generatedContent) {
            throw new Error('No content generated from AI');
        }

        // Clean markdown formatting from generated content
        generatedContent = cleanMarkdown(generatedContent);

        // Extract title and content
        const lines = generatedContent.split('\n');
        let title = `Week ${week_number} ${chart_type === 'workout' ? 'Workout' : 'Diet'} Plan`;
        let content = generatedContent;

        // Try to extract title from first line if it looks like a title
        if (lines.length > 0 && lines[0].trim().length > 0 && lines[0].trim().length < 100) {
            let firstLine = lines[0].trim();
            // Clean markdown from title as well (just in case)
            firstLine = cleanMarkdown(firstLine);
            if (!firstLine.toLowerCase().includes('user information') &&
                !firstLine.toLowerCase().includes('create') &&
                firstLine.length < 80) {
                title = firstLine;
            }
        }

        // Create the chart
        const { data: chart, error: chartError } = await supabaseAdmin
            .from('weekly_charts')
            .insert({
                membership_id,
                week_number,
                chart_type,
                title: title || null,
                content: content || null,
                file_url: null,
                created_by: null // NULL means created by admin
            })
            .select()
            .single();

        if (chartError) {
            throw chartError;
        }

        // Send notification to user
        if (membership.user_id) {
            await supabaseAdmin
                .from('notifications')
                .insert({
                    recipient_id: membership.user_id,
                    actor_role: 'admin',
                    type: 'weekly_chart_added',
                    content: `A new ${chart_type} chart for Week ${week_number} has been added to your membership.`,
                    is_read: false
                });
        }

        return NextResponse.json({
            success: true,
            chart,
            message: 'Chart generated successfully using AI'
        });
    } catch (err: any) {
        console.error('Error generating AI chart:', err);

        // Handle quota/rate limit errors
        if (err.status === 429 || err.message?.includes('quota') || err.message?.includes('rate limit')) {
            return NextResponse.json(
                {
                    error: 'API quota exceeded. Please wait a few minutes and try again, or check your OpenRouter API quota limits.',
                    details: err.message
                },
                { status: 429 }
            );
        }

        // Handle model not found errors
        if (err.status === 404 || err.message?.includes('not found')) {
            return NextResponse.json(
                {
                    error: 'The selected AI model is not available. Please check your OpenRouter API key and model name.',
                    details: err.message
                },
                { status: 404 }
            );
        }

        return NextResponse.json(
            { error: err.message || 'Failed to generate chart using AI' },
            { status: 500 }
        );
    }
}

