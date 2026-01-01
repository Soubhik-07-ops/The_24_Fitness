// This file contains all the form sections for the comprehensive membership form
// Due to size, sections are organized here

import React from 'react'
import styles from '../../app/membership/form/form.module.css'

interface FormData {
    [key: string]: any
}

interface FormSectionsProps {
    formData: FormData
    handleChange: (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => void
    handleFamilyHistoryChange: (condition: string, field: string, value: string | boolean) => void
    handleMedicalConditionDetails: (condition: string, details: string) => void
    currentSection: number
}

const medicalConditionsList = [
    'Allergies', 'Amenorrhea', 'Anemia', 'Anxiety', 'Arthritis', 'Asthma',
    'Celiac disease', 'Chronic sinus condition', 'Constipation', 'Crohn\'s disease',
    'Depression', 'Diabetes', 'Diarrhea', 'Disordered eating',
    'Gastroesophageal reflux disease (GERD)', 'High blood pressure', 'Hypoglycemia',
    'Hypo/hyperthyroidism', 'Insomnia', 'Intestinal problems', 'Irritability',
    'Irritable bowel syndrome (IBS)', 'Menopausal symptoms', 'Osteoporosis',
    'Premenstrual syndrome (PMS)', 'Polycystic ovary syndrome (PCOS)', 'Pregnant', 'Skin problems', 'Ulcer'
]

export const renderFormSection = (props: FormSectionsProps) => {
    const { formData, handleChange, handleFamilyHistoryChange, handleMedicalConditionDetails, currentSection } = props

    // Section 1: Personal Information (handled in main file)
    if (currentSection === 0) return null

    // Section 2: Medical Information
    if (currentSection === 1) {
        return (
            <div className={styles.section}>
                <h2 className={styles.sectionTitle}>Medical Information</h2>

                <div className={styles.formGroupFull}>
                    <label>1. How would you describe your present state of health? *</label>
                    <div className={styles.radioGroup}>
                        {['Very well', 'Healthy', 'Unhealthy', 'Unwell'].map(option => (
                            <label key={option} className={styles.radioLabel}>
                                <input
                                    type="radio"
                                    name="presentHealthState"
                                    value={option.toLowerCase().replace(' ', '_')}
                                    checked={formData.presentHealthState === option.toLowerCase().replace(' ', '_')}
                                    onChange={handleChange}
                                />
                                {option}
                            </label>
                        ))}
                        <label className={styles.radioLabel}>
                            <input
                                type="radio"
                                name="presentHealthState"
                                value="other"
                                checked={formData.presentHealthState === 'other'}
                                onChange={handleChange}
                            />
                            Other:
                            <input
                                type="text"
                                name="presentHealthStateOther"
                                value={formData.presentHealthStateOther || ''}
                                onChange={handleChange}
                                className={styles.inlineInput}
                                disabled={formData.presentHealthState !== 'other'}
                            />
                        </label>
                    </div>
                </div>

                <div className={styles.formGroupFull}>
                    <label htmlFor="currentMedications">
                        2. List current medications, how often you take them, and dosages (include prescriptions and over-the-counter medications).
                    </label>
                    <textarea
                        id="currentMedications"
                        name="currentMedications"
                        value={formData.currentMedications || ''}
                        onChange={handleChange}
                        rows={4}
                        placeholder="List medications, frequency, and dosages"
                    />
                </div>

                <div className={styles.formGroupFull}>
                    <label>3. Do you take all of your medications as they have been prescribed by your healthcare provider? *</label>
                    <div className={styles.radioGroup}>
                        <label className={styles.radioLabel}>
                            <input
                                type="radio"
                                name="medicationAdherence"
                                value="yes"
                                checked={formData.medicationAdherence === 'yes'}
                                onChange={handleChange}
                            />
                            Yes
                        </label>
                        <label className={styles.radioLabel}>
                            <input
                                type="radio"
                                name="medicationAdherence"
                                value="no"
                                checked={formData.medicationAdherence === 'no'}
                                onChange={handleChange}
                            />
                            No
                        </label>
                    </div>
                    {formData.medicationAdherence === 'no' && (
                        <div className={styles.formGroupFull} style={{ marginTop: '1rem' }}>
                            <label htmlFor="medicationAdherenceReason">
                                If not, please share why (e.g., cost, side effects, or feeling as though they are unnecessary).
                            </label>
                            <textarea
                                id="medicationAdherenceReason"
                                name="medicationAdherenceReason"
                                value={formData.medicationAdherenceReason || ''}
                                onChange={handleChange}
                                rows={2}
                            />
                        </div>
                    )}
                </div>

                <div className={styles.formGroupFull}>
                    <label>4. Do you take any vitamin, mineral, or herbal supplements? *</label>
                    <div className={styles.radioGroup}>
                        <label className={styles.radioLabel}>
                            <input
                                type="radio"
                                name="supplements"
                                value="yes"
                                checked={formData.supplements === 'yes'}
                                onChange={handleChange}
                            />
                            Yes
                        </label>
                        <label className={styles.radioLabel}>
                            <input
                                type="radio"
                                name="supplements"
                                value="no"
                                checked={formData.supplements === 'no'}
                                onChange={handleChange}
                            />
                            No
                        </label>
                    </div>
                    {formData.supplements === 'yes' && (
                        <div className={styles.formGroupFull} style={{ marginTop: '1rem' }}>
                            <label htmlFor="supplementsList">If yes, list type and amount per day:</label>
                            <textarea
                                id="supplementsList"
                                name="supplementsList"
                                value={formData.supplementsList || ''}
                                onChange={handleChange}
                                rows={2}
                            />
                        </div>
                    )}
                </div>

                <div className={styles.formGroup}>
                    <label htmlFor="lastPhysicianVisit">5. When was the last time you visited your physician?</label>
                    <input
                        type="date"
                        id="lastPhysicianVisit"
                        name="lastPhysicianVisit"
                        value={formData.lastPhysicianVisit || ''}
                        onChange={handleChange}
                        max={new Date().toISOString().split('T')[0]}
                    />
                </div>

                <div className={styles.formGroupFull}>
                    <label>6. Have you ever had your cholesterol checked? *</label>
                    <div className={styles.radioGroup}>
                        <label className={styles.radioLabel}>
                            <input
                                type="radio"
                                name="cholesterolChecked"
                                value="yes"
                                checked={formData.cholesterolChecked === 'yes'}
                                onChange={handleChange}
                            />
                            Yes
                        </label>
                        <label className={styles.radioLabel}>
                            <input
                                type="radio"
                                name="cholesterolChecked"
                                value="no"
                                checked={formData.cholesterolChecked === 'no'}
                                onChange={handleChange}
                            />
                            No
                        </label>
                    </div>
                    {formData.cholesterolChecked === 'yes' && (
                        <div className={styles.formGrid} style={{ marginTop: '1rem' }}>
                            <div className={styles.formGroup}>
                                <label htmlFor="cholesterolDate">Date of test:</label>
                                <input
                                    type="date"
                                    id="cholesterolDate"
                                    name="cholesterolDate"
                                    value={formData.cholesterolDate || ''}
                                    onChange={handleChange}
                                />
                            </div>
                            <div className={styles.formGroup}>
                                <label htmlFor="totalCholesterol">Total cholesterol:</label>
                                <input
                                    type="text"
                                    id="totalCholesterol"
                                    name="totalCholesterol"
                                    value={formData.totalCholesterol || ''}
                                    onChange={handleChange}
                                />
                            </div>
                            <div className={styles.formGroup}>
                                <label htmlFor="hdl">High-density lipoprotein (HDL):</label>
                                <input
                                    type="text"
                                    id="hdl"
                                    name="hdl"
                                    value={formData.hdl || ''}
                                    onChange={handleChange}
                                />
                            </div>
                            <div className={styles.formGroup}>
                                <label htmlFor="ldl">Low-density lipoprotein (LDL):</label>
                                <input
                                    type="text"
                                    id="ldl"
                                    name="ldl"
                                    value={formData.ldl || ''}
                                    onChange={handleChange}
                                />
                            </div>
                            <div className={styles.formGroup}>
                                <label htmlFor="triglycerides">Triglycerides:</label>
                                <input
                                    type="text"
                                    id="triglycerides"
                                    name="triglycerides"
                                    value={formData.triglycerides || ''}
                                    onChange={handleChange}
                                />
                            </div>
                        </div>
                    )}
                </div>

                <div className={styles.formGroupFull}>
                    <label>7. Have you ever had your blood sugar checked? *</label>
                    <div className={styles.radioGroup}>
                        <label className={styles.radioLabel}>
                            <input
                                type="radio"
                                name="bloodSugarChecked"
                                value="yes"
                                checked={formData.bloodSugarChecked === 'yes'}
                                onChange={handleChange}
                            />
                            Yes
                        </label>
                        <label className={styles.radioLabel}>
                            <input
                                type="radio"
                                name="bloodSugarChecked"
                                value="no"
                                checked={formData.bloodSugarChecked === 'no'}
                                onChange={handleChange}
                            />
                            No
                        </label>
                    </div>
                    {formData.bloodSugarChecked === 'yes' && (
                        <div className={styles.formGroupFull} style={{ marginTop: '1rem' }}>
                            <label htmlFor="bloodSugarResults">What were the results?</label>
                            <textarea
                                id="bloodSugarResults"
                                name="bloodSugarResults"
                                value={formData.bloodSugarResults || ''}
                                onChange={handleChange}
                                rows={2}
                            />
                        </div>
                    )}
                </div>

                <div className={styles.formGroupFull}>
                    <label>8. Please check any that apply to you and list any important information about your condition:</label>
                    <div className={styles.checkboxGrid}>
                        {medicalConditionsList.map(condition => {
                            const key = condition.toLowerCase().replace(/[^a-z0-9]/g, '_')
                            return (
                                <div key={condition} className={styles.checkboxItem}>
                                    <label className={styles.checkboxLabel}>
                                        <input
                                            type="checkbox"
                                            name={`medicalCondition_${key}`}
                                            checked={formData.medicalConditions?.[key]?.checked || false}
                                            onChange={handleChange}
                                        />
                                        {condition}
                                    </label>
                                    {condition === 'Allergies' && (formData.medicalConditions?.[key]?.checked) && (
                                        <input
                                            type="text"
                                            placeholder="Specify allergies"
                                            value={formData.medicalConditions?.[key]?.details || ''}
                                            onChange={(e) => handleMedicalConditionDetails(key, e.target.value)}
                                            className={styles.detailsInput}
                                        />
                                    )}
                                    {(formData.medicalConditions?.[key]?.checked) && condition !== 'Allergies' && (
                                        <textarea
                                            placeholder="Details"
                                            value={formData.medicalConditions?.[key]?.details || ''}
                                            onChange={(e) => handleMedicalConditionDetails(key, e.target.value)}
                                            rows={1}
                                            className={styles.detailsTextarea}
                                        />
                                    )}
                                </div>
                            )
                        })}
                    </div>
                </div>

                <div className={styles.formGroupFull}>
                    <label htmlFor="majorSurgeries">Major surgeries:</label>
                    <textarea
                        id="majorSurgeries"
                        name="majorSurgeries"
                        value={formData.majorSurgeries || ''}
                        onChange={handleChange}
                        rows={3}
                    />
                </div>

                <div className={styles.formGroupFull}>
                    <label htmlFor="pastInjuries">Past injuries:</label>
                    <textarea
                        id="pastInjuries"
                        name="pastInjuries"
                        value={formData.pastInjuries || ''}
                        onChange={handleChange}
                        rows={2}
                    />
                </div>

                <div className={styles.formGroupFull}>
                    <label htmlFor="otherHealthConditions">Describe any other health conditions that you have:</label>
                    <textarea
                        id="otherHealthConditions"
                        name="otherHealthConditions"
                        value={formData.otherHealthConditions || ''}
                        onChange={handleChange}
                        rows={3}
                    />
                </div>
            </div>
        )
    }

    // Section 3: Family History
    if (currentSection === 2) {
        const familyConditions = ['heartDisease', 'highCholesterol', 'highBloodPressure', 'cancer', 'diabetes', 'osteoporosis']
        const conditionLabels: { [key: string]: string } = {
            heartDisease: 'Heart disease',
            highCholesterol: 'High cholesterol',
            highBloodPressure: 'High blood pressure',
            cancer: 'Cancer',
            diabetes: 'Diabetes',
            osteoporosis: 'Osteoporosis'
        }

        return (
            <div className={styles.section}>
                <h2 className={styles.sectionTitle}>Family History</h2>
                <div className={styles.formGroupFull}>
                    <label>1. Has anyone in your immediate family been diagnosed with the following?</label>
                    {familyConditions.map(condition => (
                        <div key={condition} className={styles.familyHistoryItem}>
                            <label className={styles.checkboxLabel}>
                                <input
                                    type="checkbox"
                                    checked={formData.familyHistory?.[condition]?.checked || false}
                                    onChange={(e) => handleFamilyHistoryChange(condition, 'checked', e.target.checked)}
                                />
                                {conditionLabels[condition]}
                            </label>
                            {formData.familyHistory?.[condition]?.checked && (
                                <div className={styles.formGrid} style={{ marginTop: '0.5rem' }}>
                                    <div className={styles.formGroup}>
                                        <label htmlFor={`${condition}_relation`}>If yes, what is the relation?</label>
                                        <input
                                            type="text"
                                            id={`${condition}_relation`}
                                            value={formData.familyHistory?.[condition]?.relation || ''}
                                            onChange={(e) => handleFamilyHistoryChange(condition, 'relation', e.target.value)}
                                            placeholder="e.g., Mother, Father, Sibling"
                                        />
                                    </div>
                                    <div className={styles.formGroup}>
                                        <label htmlFor={`${condition}_age`}>Age of diagnosis:</label>
                                        <input
                                            type="text"
                                            id={`${condition}_age`}
                                            value={formData.familyHistory?.[condition]?.age || ''}
                                            onChange={(e) => handleFamilyHistoryChange(condition, 'age', e.target.value)}
                                            placeholder="Age"
                                        />
                                    </div>
                                </div>
                            )}
                        </div>
                    ))}
                </div>
            </div>
        )
    }

    // Section 4: Nutrition
    if (currentSection === 3) {
        return (
            <div className={styles.section}>
                <h2 className={styles.sectionTitle}>Nutrition</h2>

                <div className={styles.formGroupFull}>
                    <label htmlFor="dietaryGoals">1. What are your dietary goals? *</label>
                    <textarea
                        id="dietaryGoals"
                        name="dietaryGoals"
                        value={formData.dietaryGoals || ''}
                        onChange={handleChange}
                        rows={3}
                        required
                        placeholder="Describe your dietary goals"
                    />
                </div>

                <div className={styles.formGroupFull}>
                    <label>2. Have you ever followed a modified diet? *</label>
                    <div className={styles.radioGroup}>
                        <label className={styles.radioLabel}>
                            <input
                                type="radio"
                                name="modifiedDiet"
                                value="yes"
                                checked={formData.modifiedDiet === 'yes'}
                                onChange={handleChange}
                            />
                            Yes
                        </label>
                        <label className={styles.radioLabel}>
                            <input
                                type="radio"
                                name="modifiedDiet"
                                value="no"
                                checked={formData.modifiedDiet === 'no'}
                                onChange={handleChange}
                            />
                            No
                        </label>
                    </div>
                    {formData.modifiedDiet === 'yes' && (
                        <div className={styles.formGroupFull} style={{ marginTop: '1rem' }}>
                            <label htmlFor="modifiedDietDescription">If yes, describe:</label>
                            <textarea
                                id="modifiedDietDescription"
                                name="modifiedDietDescription"
                                value={formData.modifiedDietDescription || ''}
                                onChange={handleChange}
                                rows={2}
                            />
                        </div>
                    )}
                </div>

                <div className={styles.formGroupFull}>
                    <label>3. Are you currently following a specialized eating plan (e.g., low-sodium or low-fat)? *</label>
                    <div className={styles.radioGroup}>
                        <label className={styles.radioLabel}>
                            <input
                                type="radio"
                                name="specializedEatingPlan"
                                value="yes"
                                checked={formData.specializedEatingPlan === 'yes'}
                                onChange={handleChange}
                            />
                            Yes
                        </label>
                        <label className={styles.radioLabel}>
                            <input
                                type="radio"
                                name="specializedEatingPlan"
                                value="no"
                                checked={formData.specializedEatingPlan === 'no'}
                                onChange={handleChange}
                            />
                            No
                        </label>
                    </div>
                    {formData.specializedEatingPlan === 'yes' && (
                        <>
                            <div className={styles.formGroupFull} style={{ marginTop: '1rem' }}>
                                <label htmlFor="eatingPlanType">If yes, what type of eating plan?</label>
                                <input
                                    type="text"
                                    id="eatingPlanType"
                                    name="eatingPlanType"
                                    value={formData.eatingPlanType || ''}
                                    onChange={handleChange}
                                />
                            </div>
                            <div className={styles.formGroupFull}>
                                <label htmlFor="eatingPlanReason">Why did you choose this eating plan?</label>
                                <textarea
                                    id="eatingPlanReason"
                                    name="eatingPlanReason"
                                    value={formData.eatingPlanReason || ''}
                                    onChange={handleChange}
                                    rows={2}
                                />
                            </div>
                            <div className={styles.formGroupFull}>
                                <label>Was the eating plan prescribed by a physician?</label>
                                <div className={styles.radioGroup}>
                                    <label className={styles.radioLabel}>
                                        <input
                                            type="radio"
                                            name="eatingPlanPrescribed"
                                            value="yes"
                                            checked={formData.eatingPlanPrescribed === 'yes'}
                                            onChange={handleChange}
                                        />
                                        Yes
                                    </label>
                                    <label className={styles.radioLabel}>
                                        <input
                                            type="radio"
                                            name="eatingPlanPrescribed"
                                            value="no"
                                            checked={formData.eatingPlanPrescribed === 'no'}
                                            onChange={handleChange}
                                        />
                                        No
                                    </label>
                                </div>
                            </div>
                            <div className={styles.formGroupFull}>
                                <label htmlFor="eatingPlanDuration">How long have you been on the eating plan?</label>
                                <input
                                    type="text"
                                    id="eatingPlanDuration"
                                    name="eatingPlanDuration"
                                    value={formData.eatingPlanDuration || ''}
                                    onChange={handleChange}
                                />
                            </div>
                        </>
                    )}
                </div>

                <div className={styles.formGroupFull}>
                    <label>5. Have you ever met with a registered dietitian or attended diabetes education classes? *</label>
                    <div className={styles.radioGroup}>
                        <label className={styles.radioLabel}>
                            <input
                                type="radio"
                                name="dietitianConsultation"
                                value="yes"
                                checked={formData.dietitianConsultation === 'yes'}
                                onChange={handleChange}
                            />
                            Yes
                        </label>
                        <label className={styles.radioLabel}>
                            <input
                                type="radio"
                                name="dietitianConsultation"
                                value="no"
                                checked={formData.dietitianConsultation === 'no'}
                                onChange={handleChange}
                            />
                            No
                        </label>
                    </div>
                    {formData.dietitianConsultation === 'no' && (
                        <div className={styles.formGroupFull} style={{ marginTop: '1rem' }}>
                            <label>If no, are you interested in doing so?</label>
                            <div className={styles.radioGroup}>
                                <label className={styles.radioLabel}>
                                    <input
                                        type="radio"
                                        name="dietitianInterest"
                                        value="yes"
                                        checked={formData.dietitianInterest === 'yes'}
                                        onChange={handleChange}
                                    />
                                    Yes
                                </label>
                                <label className={styles.radioLabel}>
                                    <input
                                        type="radio"
                                        name="dietitianInterest"
                                        value="no"
                                        checked={formData.dietitianInterest === 'no'}
                                        onChange={handleChange}
                                    />
                                    No
                                </label>
                            </div>
                        </div>
                    )}
                </div>

                <div className={styles.formGroupFull}>
                    <label htmlFor="nutritionalIssues">
                        6. What do you consider to be the major issues with your nutritional choices or eating plan (e.g., eating late at night, snacking on high-fat foods, skipping meals, or lack of variety)?
                    </label>
                    <textarea
                        id="nutritionalIssues"
                        name="nutritionalIssues"
                        value={formData.nutritionalIssues || ''}
                        onChange={handleChange}
                        rows={3}
                    />
                </div>

                <div className={styles.formGroup}>
                    <label htmlFor="waterIntake">7. How many glasses of water do you drink per day?</label>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                        <input
                            type="number"
                            id="waterIntake"
                            name="waterIntake"
                            value={formData.waterIntake || ''}
                            onChange={handleChange}
                            min="0"
                            style={{ flex: 1 }}
                        />
                        <span>8-ounce glasses</span>
                    </div>
                </div>

                <div className={styles.formGroupFull}>
                    <label htmlFor="otherBeverages">8. What do you drink other than water? List what and how much per day.</label>
                    <textarea
                        id="otherBeverages"
                        name="otherBeverages"
                        value={formData.otherBeverages || ''}
                        onChange={handleChange}
                        rows={2}
                    />
                </div>

                <div className={styles.formGroupFull}>
                    <label>9. Do you have any food allergies or intolerance? *</label>
                    <div className={styles.radioGroup}>
                        <label className={styles.radioLabel}>
                            <input
                                type="radio"
                                name="foodAllergies"
                                value="yes"
                                checked={formData.foodAllergies === 'yes'}
                                onChange={handleChange}
                            />
                            Yes
                        </label>
                        <label className={styles.radioLabel}>
                            <input
                                type="radio"
                                name="foodAllergies"
                                value="no"
                                checked={formData.foodAllergies === 'no'}
                                onChange={handleChange}
                            />
                            No
                        </label>
                    </div>
                    {formData.foodAllergies === 'yes' && (
                        <div className={styles.formGroupFull} style={{ marginTop: '1rem' }}>
                            <label htmlFor="foodAllergiesList">If yes, what?</label>
                            <input
                                type="text"
                                id="foodAllergiesList"
                                name="foodAllergiesList"
                                value={formData.foodAllergiesList || ''}
                                onChange={handleChange}
                            />
                        </div>
                    )}
                </div>

                <div className={styles.formGroupFull}>
                    <label>10. Who shops for and prepares your food?</label>
                    <div className={styles.checkboxGroup}>
                        {['Self', 'Spouse', 'Parent', 'Minimal preparation'].map(option => (
                            <label key={option} className={styles.checkboxLabel}>
                                <input
                                    type="checkbox"
                                    name={`foodPreparation_${option.toLowerCase().replace(' ', '_')}`}
                                    checked={formData.foodPreparation?.includes(option.toLowerCase().replace(' ', '_')) || false}
                                    onChange={handleChange}
                                />
                                {option}
                            </label>
                        ))}
                    </div>
                </div>

                <div className={styles.formGroup}>
                    <label htmlFor="dineOutFrequency">11. How often do you dine out?</label>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                        <input
                            type="number"
                            id="dineOutFrequency"
                            name="dineOutFrequency"
                            value={formData.dineOutFrequency || ''}
                            onChange={handleChange}
                            min="0"
                            style={{ flex: 1 }}
                        />
                        <span>times per week</span>
                    </div>
                </div>

                <div className={styles.formGroupFull}>
                    <label>12. Please specify the type of restaurants for each meal:</label>
                    <div className={styles.formGrid}>
                        <div className={styles.formGroup}>
                            <label htmlFor="restaurantBreakfast">Breakfast:</label>
                            <input
                                type="text"
                                id="restaurantBreakfast"
                                name="restaurantBreakfast"
                                value={formData.restaurantBreakfast || ''}
                                onChange={handleChange}
                            />
                        </div>
                        <div className={styles.formGroup}>
                            <label htmlFor="restaurantLunch">Lunch:</label>
                            <input
                                type="text"
                                id="restaurantLunch"
                                name="restaurantLunch"
                                value={formData.restaurantLunch || ''}
                                onChange={handleChange}
                            />
                        </div>
                        <div className={styles.formGroup}>
                            <label htmlFor="restaurantDinner">Dinner:</label>
                            <input
                                type="text"
                                id="restaurantDinner"
                                name="restaurantDinner"
                                value={formData.restaurantDinner || ''}
                                onChange={handleChange}
                            />
                        </div>
                        <div className={styles.formGroup}>
                            <label htmlFor="restaurantSnacks">Snacks:</label>
                            <input
                                type="text"
                                id="restaurantSnacks"
                                name="restaurantSnacks"
                                value={formData.restaurantSnacks || ''}
                                onChange={handleChange}
                            />
                        </div>
                    </div>
                </div>

                <div className={styles.formGroupFull}>
                    <label>13. Do you crave any foods? *</label>
                    <div className={styles.radioGroup}>
                        <label className={styles.radioLabel}>
                            <input
                                type="radio"
                                name="foodCravings"
                                value="yes"
                                checked={formData.foodCravings === 'yes'}
                                onChange={handleChange}
                            />
                            Yes
                        </label>
                        <label className={styles.radioLabel}>
                            <input
                                type="radio"
                                name="foodCravings"
                                value="no"
                                checked={formData.foodCravings === 'no'}
                                onChange={handleChange}
                            />
                            No
                        </label>
                    </div>
                    {formData.foodCravings === 'yes' && (
                        <div className={styles.formGroupFull} style={{ marginTop: '1rem' }}>
                            <label htmlFor="foodCravingsList">If yes, please specify:</label>
                            <input
                                type="text"
                                id="foodCravingsList"
                                name="foodCravingsList"
                                value={formData.foodCravingsList || ''}
                                onChange={handleChange}
                            />
                        </div>
                    )}
                </div>
            </div>
        )
    }

    // Section 5: Substance-related Habits
    if (currentSection === 4) {
        return (
            <div className={styles.section}>
                <h2 className={styles.sectionTitle}>Substance-related Habits</h2>

                <div className={styles.formGroupFull}>
                    <label>1. Do you drink alcohol? *</label>
                    <div className={styles.radioGroup}>
                        <label className={styles.radioLabel}>
                            <input
                                type="radio"
                                name="alcohol"
                                value="yes"
                                checked={formData.alcohol === 'yes'}
                                onChange={handleChange}
                            />
                            Yes
                        </label>
                        <label className={styles.radioLabel}>
                            <input
                                type="radio"
                                name="alcohol"
                                value="no"
                                checked={formData.alcohol === 'no'}
                                onChange={handleChange}
                            />
                            No
                        </label>
                    </div>
                    {formData.alcohol === 'yes' && (
                        <div className={styles.formGrid} style={{ marginTop: '1rem' }}>
                            <div className={styles.formGroup}>
                                <label htmlFor="alcoholFrequency">If yes, how often?</label>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                    <input
                                        type="number"
                                        id="alcoholFrequency"
                                        name="alcoholFrequency"
                                        value={formData.alcoholFrequency || ''}
                                        onChange={handleChange}
                                        min="0"
                                        style={{ flex: 1 }}
                                    />
                                    <span>times per week</span>
                                </div>
                            </div>
                            <div className={styles.formGroup}>
                                <label htmlFor="alcoholAmount">Average amount?</label>
                                <input
                                    type="text"
                                    id="alcoholAmount"
                                    name="alcoholAmount"
                                    value={formData.alcoholAmount || ''}
                                    onChange={handleChange}
                                />
                            </div>
                        </div>
                    )}
                </div>

                <div className={styles.formGroupFull}>
                    <label>2. Do you drink caffeinated beverages? *</label>
                    <div className={styles.radioGroup}>
                        <label className={styles.radioLabel}>
                            <input
                                type="radio"
                                name="caffeinatedBeverages"
                                value="yes"
                                checked={formData.caffeinatedBeverages === 'yes'}
                                onChange={handleChange}
                            />
                            Yes
                        </label>
                        <label className={styles.radioLabel}>
                            <input
                                type="radio"
                                name="caffeinatedBeverages"
                                value="no"
                                checked={formData.caffeinatedBeverages === 'no'}
                                onChange={handleChange}
                            />
                            No
                        </label>
                    </div>
                    {formData.caffeinatedBeverages === 'yes' && (
                        <div className={styles.formGroupFull} style={{ marginTop: '1rem' }}>
                            <label htmlFor="caffeineAmount">If yes, average number per day:</label>
                            <input
                                type="number"
                                id="caffeineAmount"
                                name="caffeineAmount"
                                value={formData.caffeineAmount || ''}
                                onChange={handleChange}
                                min="0"
                            />
                        </div>
                    )}
                </div>

                <div className={styles.formGroupFull}>
                    <label>3. Do you use tobacco? *</label>
                    <div className={styles.radioGroup}>
                        <label className={styles.radioLabel}>
                            <input
                                type="radio"
                                name="tobacco"
                                value="yes"
                                checked={formData.tobacco === 'yes'}
                                onChange={handleChange}
                            />
                            Yes
                        </label>
                        <label className={styles.radioLabel}>
                            <input
                                type="radio"
                                name="tobacco"
                                value="no"
                                checked={formData.tobacco === 'no'}
                                onChange={handleChange}
                            />
                            No
                        </label>
                    </div>
                    {formData.tobacco === 'yes' && (
                        <div className={styles.formGroupFull} style={{ marginTop: '1rem' }}>
                            <label htmlFor="tobaccoAmount">
                                If yes, how much (cigarettes, cigars, or chewing tobacco per day)?
                            </label>
                            <input
                                type="text"
                                id="tobaccoAmount"
                                name="tobaccoAmount"
                                value={formData.tobaccoAmount || ''}
                                onChange={handleChange}
                            />
                        </div>
                    )}
                </div>
            </div>
        )
    }

    // Section 6: Physical Activity
    if (currentSection === 5) {
        return (
            <div className={styles.section}>
                <h2 className={styles.sectionTitle}>Physical Activity</h2>

                <div className={styles.formGroupFull}>
                    <label>1. Do you currently participate in any structured physical activity? *</label>
                    <div className={styles.radioGroup}>
                        <label className={styles.radioLabel}>
                            <input
                                type="radio"
                                name="structuredActivity"
                                value="yes"
                                checked={formData.structuredActivity === 'yes'}
                                onChange={handleChange}
                            />
                            Yes
                        </label>
                        <label className={styles.radioLabel}>
                            <input
                                type="radio"
                                name="structuredActivity"
                                value="no"
                                checked={formData.structuredActivity === 'no'}
                                onChange={handleChange}
                            />
                            No
                        </label>
                    </div>
                    {formData.structuredActivity === 'yes' && (
                        <div className={styles.formGrid} style={{ marginTop: '1rem' }}>
                            <div className={styles.formGroup}>
                                <label htmlFor="cardioMinutes">Cardiorespiratory activity:</label>
                                <input
                                    type="number"
                                    id="cardioMinutes"
                                    name="cardioMinutes"
                                    value={formData.cardioMinutes || ''}
                                    onChange={handleChange}
                                    min="0"
                                    placeholder="Minutes"
                                />
                            </div>
                            <div className={styles.formGroup}>
                                <label htmlFor="cardioTimesPerWeek">Times per week:</label>
                                <input
                                    type="number"
                                    id="cardioTimesPerWeek"
                                    name="cardioTimesPerWeek"
                                    value={formData.cardioTimesPerWeek || ''}
                                    onChange={handleChange}
                                    min="0"
                                />
                            </div>
                            <div className={styles.formGroup}>
                                <label htmlFor="muscularTrainingSessions">Muscular-training sessions per week:</label>
                                <input
                                    type="number"
                                    id="muscularTrainingSessions"
                                    name="muscularTrainingSessions"
                                    value={formData.muscularTrainingSessions || ''}
                                    onChange={handleChange}
                                    min="0"
                                />
                            </div>
                            <div className={styles.formGroup}>
                                <label htmlFor="flexibilitySessions">Flexibility-training sessions per week:</label>
                                <input
                                    type="number"
                                    id="flexibilitySessions"
                                    name="flexibilitySessions"
                                    value={formData.flexibilitySessions || ''}
                                    onChange={handleChange}
                                    min="0"
                                />
                            </div>
                            <div className={styles.formGroup}>
                                <label htmlFor="sportsMinutes">Sports or recreational activities (minutes per week):</label>
                                <input
                                    type="number"
                                    id="sportsMinutes"
                                    name="sportsMinutes"
                                    value={formData.sportsMinutes || ''}
                                    onChange={handleChange}
                                    min="0"
                                />
                            </div>
                            <div className={styles.formGroupFull}>
                                <label htmlFor="sportsActivities">List sports or activities you participate in:</label>
                                <input
                                    type="text"
                                    id="sportsActivities"
                                    name="sportsActivities"
                                    value={formData.sportsActivities || ''}
                                    onChange={handleChange}
                                />
                            </div>
                        </div>
                    )}
                </div>

                <div className={styles.formGroupFull}>
                    <label>2. Do you engage in any other forms of regular physical activity? *</label>
                    <div className={styles.radioGroup}>
                        <label className={styles.radioLabel}>
                            <input
                                type="radio"
                                name="otherPhysicalActivity"
                                value="yes"
                                checked={formData.otherPhysicalActivity === 'yes'}
                                onChange={handleChange}
                            />
                            Yes
                        </label>
                        <label className={styles.radioLabel}>
                            <input
                                type="radio"
                                name="otherPhysicalActivity"
                                value="no"
                                checked={formData.otherPhysicalActivity === 'no'}
                                onChange={handleChange}
                            />
                            No
                        </label>
                    </div>
                    {formData.otherPhysicalActivity === 'yes' && (
                        <div className={styles.formGroupFull} style={{ marginTop: '1rem' }}>
                            <label htmlFor="otherPhysicalActivityDescription">If yes, describe:</label>
                            <input
                                type="text"
                                id="otherPhysicalActivityDescription"
                                name="otherPhysicalActivityDescription"
                                value={formData.otherPhysicalActivityDescription || ''}
                                onChange={handleChange}
                            />
                        </div>
                    )}
                </div>

                <div className={styles.formGroupFull}>
                    <label>3. Have you ever experienced any injuries that may limit your physical activity? *</label>
                    <div className={styles.radioGroup}>
                        <label className={styles.radioLabel}>
                            <input
                                type="radio"
                                name="activityInjuries"
                                value="yes"
                                checked={formData.activityInjuries === 'yes'}
                                onChange={handleChange}
                            />
                            Yes
                        </label>
                        <label className={styles.radioLabel}>
                            <input
                                type="radio"
                                name="activityInjuries"
                                value="no"
                                checked={formData.activityInjuries === 'no'}
                                onChange={handleChange}
                            />
                            No
                        </label>
                    </div>
                    {formData.activityInjuries === 'yes' && (
                        <div className={styles.formGroupFull} style={{ marginTop: '1rem' }}>
                            <label htmlFor="activityInjuriesDescription">If yes, describe:</label>
                            <input
                                type="text"
                                id="activityInjuriesDescription"
                                name="activityInjuriesDescription"
                                value={formData.activityInjuriesDescription || ''}
                                onChange={handleChange}
                            />
                        </div>
                    )}
                </div>

                <div className={styles.formGroupFull}>
                    <label htmlFor="activityRestrictions">4. Do you have any physical-activity restrictions? If so, please list:</label>
                    <textarea
                        id="activityRestrictions"
                        name="activityRestrictions"
                        value={Array.isArray(formData.activityRestrictions) ? formData.activityRestrictions.join(', ') : (formData.activityRestrictions || '')}
                        onChange={handleChange}
                        rows={3}
                        placeholder="List any physical activity restrictions (comma-separated)"
                    />
                </div>

                <div className={styles.formGroupFull}>
                    <label htmlFor="exerciseFeelings">5. What are your honest feelings about exercise/physical activity?</label>
                    <textarea
                        id="exerciseFeelings"
                        name="exerciseFeelings"
                        value={formData.exerciseFeelings || ''}
                        onChange={handleChange}
                        rows={3}
                    />
                </div>

                <div className={styles.formGroupFull}>
                    <label htmlFor="favoriteActivities">6. What are some of your favorite physical activities?</label>
                    <textarea
                        id="favoriteActivities"
                        name="favoriteActivities"
                        value={formData.favoriteActivities || ''}
                        onChange={handleChange}
                        rows={2}
                    />
                </div>
            </div>
        )
    }

    // Section 7: Occupational
    if (currentSection === 6) {
        return (
            <div className={styles.section}>
                <h2 className={styles.sectionTitle}>Occupational</h2>

                <div className={styles.formGroupFull}>
                    <label>1. Do you work? *</label>
                    <div className={styles.radioGroup}>
                        <label className={styles.radioLabel}>
                            <input
                                type="radio"
                                name="work"
                                value="yes"
                                checked={formData.work === 'yes'}
                                onChange={handleChange}
                            />
                            Yes
                        </label>
                        <label className={styles.radioLabel}>
                            <input
                                type="radio"
                                name="work"
                                value="no"
                                checked={formData.work === 'no'}
                                onChange={handleChange}
                            />
                            No
                        </label>
                    </div>
                    {formData.work === 'yes' && (
                        <>
                            <div className={styles.formGroupFull} style={{ marginTop: '1rem' }}>
                                <label htmlFor="occupation">If yes, what is your occupation?</label>
                                <input
                                    type="text"
                                    id="occupation"
                                    name="occupation"
                                    value={formData.occupation || ''}
                                    onChange={handleChange}
                                />
                            </div>
                            <div className={styles.formGroupFull}>
                                <label htmlFor="workSchedule">If you work, what is your work schedule?</label>
                                <input
                                    type="text"
                                    id="workSchedule"
                                    name="workSchedule"
                                    value={formData.workSchedule || ''}
                                    onChange={handleChange}
                                />
                            </div>
                        </>
                    )}
                </div>

                <div className={styles.formGroupFull}>
                    <label htmlFor="workActivityLevel">2. Describe your activity level during the work day:</label>
                    <textarea
                        id="workActivityLevel"
                        name="workActivityLevel"
                        value={formData.workActivityLevel || ''}
                        onChange={handleChange}
                        rows={3}
                    />
                </div>
            </div>
        )
    }

    // Section 8: Sleep and Stress
    if (currentSection === 7) {
        return (
            <div className={styles.section}>
                <h2 className={styles.sectionTitle}>Sleep and Stress</h2>

                <div className={styles.formGroup}>
                    <label htmlFor="sleepHours">1. How many hours of sleep do you get at night?</label>
                    <input
                        type="number"
                        id="sleepHours"
                        name="sleepHours"
                        value={formData.sleepHours || ''}
                        onChange={handleChange}
                        min="0"
                        max="24"
                        step="0.5"
                    />
                </div>

                <div className={styles.formGroup}>
                    <label htmlFor="stressLevel">
                        2. Rate your average stress level from 1 (no stress) to 10 (constant stress).
                    </label>
                    <input
                        type="number"
                        id="stressLevel"
                        name="stressLevel"
                        value={formData.stressLevel || ''}
                        onChange={handleChange}
                        min="1"
                        max="10"
                    />
                </div>

                <div className={styles.formGroupFull}>
                    <label htmlFor="stressCauses">3. What is most stressful to you?</label>
                    <input
                        type="text"
                        id="stressCauses"
                        name="stressCauses"
                        value={formData.stressCauses || ''}
                        onChange={handleChange}
                    />
                </div>

                <div className={styles.formGroupFull}>
                    <label>4. How is your appetite affected by stress? *</label>
                    <div className={styles.radioGroup}>
                        <label className={styles.radioLabel}>
                            <input
                                type="radio"
                                name="stressAppetite"
                                value="increased"
                                checked={formData.stressAppetite === 'increased'}
                                onChange={handleChange}
                            />
                            Increased
                        </label>
                        <label className={styles.radioLabel}>
                            <input
                                type="radio"
                                name="stressAppetite"
                                value="not_affected"
                                checked={formData.stressAppetite === 'not_affected'}
                                onChange={handleChange}
                            />
                            Not affected
                        </label>
                        <label className={styles.radioLabel}>
                            <input
                                type="radio"
                                name="stressAppetite"
                                value="decreased"
                                checked={formData.stressAppetite === 'decreased'}
                                onChange={handleChange}
                            />
                            Decreased
                        </label>
                    </div>
                </div>
            </div>
        )
    }

    // Section 9: Weight History
    if (currentSection === 8) {
        return (
            <div className={styles.section}>
                <h2 className={styles.sectionTitle}>Weight History</h2>

                <div className={styles.formGroup}>
                    <label htmlFor="presentWeight">1. What is your present weight?</label>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                        <input
                            type="number"
                            id="presentWeight"
                            name="presentWeight"
                            value={formData.presentWeight || ''}
                            onChange={handleChange}
                            min="0"
                            step="0.1"
                            style={{ flex: 1 }}
                            disabled={formData.presentWeightUnknown}
                        />
                        <label className={styles.checkboxLabel} style={{ margin: 0 }}>
                            <input
                                type="checkbox"
                                name="presentWeightUnknown"
                                checked={formData.presentWeightUnknown || false}
                                onChange={handleChange}
                            />
                            Don't know
                        </label>
                    </div>
                </div>

                <div className={styles.formGroupFull}>
                    <label>2. What would you like to do with your weight? *</label>
                    <div className={styles.radioGroup}>
                        <label className={styles.radioLabel}>
                            <input
                                type="radio"
                                name="weightGoal"
                                value="lose_weight"
                                checked={formData.weightGoal === 'lose_weight'}
                                onChange={handleChange}
                            />
                            Lose weight
                        </label>
                        <label className={styles.radioLabel}>
                            <input
                                type="radio"
                                name="weightGoal"
                                value="gain_weight"
                                checked={formData.weightGoal === 'gain_weight'}
                                onChange={handleChange}
                            />
                            Gain weight
                        </label>
                        <label className={styles.radioLabel}>
                            <input
                                type="radio"
                                name="weightGoal"
                                value="maintain_weight"
                                checked={formData.weightGoal === 'maintain_weight'}
                                onChange={handleChange}
                            />
                            Maintain weight
                        </label>
                    </div>
                </div>

                <div className={styles.formGroup}>
                    <label htmlFor="lowestWeight5Years">3. What was your lowest weight within the past 5 years?</label>
                    <input
                        type="number"
                        id="lowestWeight5Years"
                        name="lowestWeight5Years"
                        value={formData.lowestWeight5Years || ''}
                        onChange={handleChange}
                        min="0"
                        step="0.1"
                    />
                </div>

                <div className={styles.formGroup}>
                    <label htmlFor="highestWeight5Years">4. What was your highest weight within the past 5 years?</label>
                    <input
                        type="number"
                        id="highestWeight5Years"
                        name="highestWeight5Years"
                        value={formData.highestWeight5Years || ''}
                        onChange={handleChange}
                        min="0"
                        step="0.1"
                    />
                </div>

                <div className={styles.formGroup}>
                    <label htmlFor="idealWeight">5. What do you consider to be your ideal weight (the sustainable weight at which you feel best)?</label>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                        <input
                            type="number"
                            id="idealWeight"
                            name="idealWeight"
                            value={formData.idealWeight || ''}
                            onChange={handleChange}
                            min="0"
                            step="0.1"
                            style={{ flex: 1 }}
                            disabled={formData.idealWeightUnknown}
                        />
                        <label className={styles.checkboxLabel} style={{ margin: 0 }}>
                            <input
                                type="checkbox"
                                name="idealWeightUnknown"
                                checked={formData.idealWeightUnknown || false}
                                onChange={handleChange}
                            />
                            Don't know
                        </label>
                    </div>
                </div>

                <div className={styles.formGroupFull}>
                    <label>6. What are your current waist and hip circumferences?</label>
                    <div className={styles.formGrid}>
                        <div className={styles.formGroup}>
                            <label htmlFor="waistCircumference">Waist:</label>
                            <input
                                type="number"
                                id="waistCircumference"
                                name="waistCircumference"
                                value={formData.waistCircumference || ''}
                                onChange={handleChange}
                                min="0"
                                step="0.1"
                                disabled={formData.measurementsUnknown}
                            />
                        </div>
                        <div className={styles.formGroup}>
                            <label htmlFor="hipCircumference">Hip:</label>
                            <input
                                type="number"
                                id="hipCircumference"
                                name="hipCircumference"
                                value={formData.hipCircumference || ''}
                                onChange={handleChange}
                                min="0"
                                step="0.1"
                                disabled={formData.measurementsUnknown}
                            />
                        </div>
                    </div>
                    <label className={styles.checkboxLabel} style={{ marginTop: '0.5rem' }}>
                        <input
                            type="checkbox"
                            name="measurementsUnknown"
                            checked={formData.measurementsUnknown || false}
                            onChange={handleChange}
                        />
                        Don't know
                    </label>
                </div>

                <div className={styles.formGroup}>
                    <label htmlFor="bodyComposition">7. What is your current body composition?</label>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                        <input
                            type="number"
                            id="bodyComposition"
                            name="bodyComposition"
                            value={formData.bodyComposition || ''}
                            onChange={handleChange}
                            min="0"
                            max="100"
                            step="0.1"
                            style={{ flex: 1 }}
                            placeholder="% body fat"
                            disabled={formData.bodyCompositionUnknown}
                        />
                        <label className={styles.checkboxLabel} style={{ margin: 0 }}>
                            <input
                                type="checkbox"
                                name="bodyCompositionUnknown"
                                checked={formData.bodyCompositionUnknown || false}
                                onChange={handleChange}
                            />
                            Don't know
                        </label>
                    </div>
                </div>
            </div>
        )
    }

    // Section 10: Goals
    if (currentSection === 9) {
        return (
            <div className={styles.section}>
                <h2 className={styles.sectionTitle}>Goals</h2>

                <div className={styles.formGroup}>
                    <label htmlFor="lifestyleAdoptionLikelihood">
                        1. On a scale of 1 to 10, how likely are you to adopt a healthier lifestyle (1 = very unlikely; 10 = very likely)?
                    </label>
                    <input
                        type="number"
                        id="lifestyleAdoptionLikelihood"
                        name="lifestyleAdoptionLikelihood"
                        value={formData.lifestyleAdoptionLikelihood || ''}
                        onChange={handleChange}
                        min="1"
                        max="10"
                    />
                </div>

                <div className={styles.formGroupFull}>
                    <label>2. Do you have any specific goals for improving your health? *</label>
                    <div className={styles.radioGroup}>
                        <label className={styles.radioLabel}>
                            <input
                                type="radio"
                                name="specificHealthGoals"
                                value="yes"
                                checked={formData.specificHealthGoals === 'yes'}
                                onChange={handleChange}
                            />
                            Yes
                        </label>
                        <label className={styles.radioLabel}>
                            <input
                                type="radio"
                                name="specificHealthGoals"
                                value="no"
                                checked={formData.specificHealthGoals === 'no'}
                                onChange={handleChange}
                            />
                            No
                        </label>
                    </div>
                    {formData.specificHealthGoals === 'yes' && (
                        <div className={styles.formGroupFull} style={{ marginTop: '1rem' }}>
                            <label htmlFor="healthGoalsList">If yes, please list them in order of importance:</label>
                            <textarea
                                id="healthGoalsList"
                                name="healthGoalsList"
                                value={formData.healthGoalsList || ''}
                                onChange={handleChange}
                                rows={4}
                            />
                        </div>
                    )}
                </div>

                <div className={styles.formGroupFull}>
                    <label>3. Do you have a weight-loss goal? *</label>
                    <div className={styles.radioGroup}>
                        <label className={styles.radioLabel}>
                            <input
                                type="radio"
                                name="weightLossGoal"
                                value="yes"
                                checked={formData.weightLossGoal === 'yes'}
                                onChange={handleChange}
                            />
                            Yes
                        </label>
                        <label className={styles.radioLabel}>
                            <input
                                type="radio"
                                name="weightLossGoal"
                                value="no"
                                checked={formData.weightLossGoal === 'no'}
                                onChange={handleChange}
                            />
                            No
                        </label>
                    </div>
                    {formData.weightLossGoal === 'yes' && (
                        <div className={styles.formGroupFull} style={{ marginTop: '1rem' }}>
                            <label htmlFor="weightLossGoalAmount">If yes, what is it?</label>
                            <input
                                type="text"
                                id="weightLossGoalAmount"
                                name="weightLossGoalAmount"
                                value={formData.weightLossGoalAmount || ''}
                                onChange={handleChange}
                            />
                        </div>
                    )}
                </div>

                <div className={styles.formGroupFull}>
                    <label htmlFor="weightLossImportance">4. If you want to lose weight, why is that important to you?</label>
                    <textarea
                        id="weightLossImportance"
                        name="weightLossImportance"
                        value={formData.weightLossImportance || ''}
                        onChange={handleChange}
                        rows={3}
                    />
                </div>
            </div>
        )
    }

    return null
}
