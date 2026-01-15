// This file contains all the form sections for the comprehensive membership form
// Due to size, sections are organized here

import React from 'react'
import styles from '../../app/membership/form/form.module.css'
import { getTranslation, type Language, translations } from '@/lib/formTranslations'

interface FormData {
    [key: string]: any
}

interface FormSectionsProps {
    formData: FormData
    handleChange: (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => void
    handleFamilyHistoryChange: (condition: string, field: string, value: string | boolean) => void
    handleMedicalConditionDetails: (condition: string, details: string) => void
    currentSection: number
    language?: Language
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
    const { formData, handleChange, handleFamilyHistoryChange, handleMedicalConditionDetails, currentSection, language = 'en' } = props
    const t = (key: keyof typeof translations.en) => getTranslation(language, key)

    // Section 1: Personal Information (handled in main file)
    if (currentSection === 0) return null

    // Section 2: Medical Information
    if (currentSection === 1) {
        return (
            <div className={styles.section}>
                <h2 className={styles.sectionTitle}>{t('medicalInformation')}</h2>

                <div className={styles.formGroupFull}>
                    <label>1. {t('presentHealthState')} <span style={{ color: '#ff6b35' }}>*</span></label>
                    <div className={styles.radioGroup}>
                        {[
                            { en: 'Very well', hi: 'बहुत अच्छा', value: 'very_well' },
                            { en: 'Healthy', hi: 'स्वस्थ', value: 'healthy' },
                            { en: 'Unhealthy', hi: 'अस्वस्थ', value: 'unhealthy' },
                            { en: 'Unwell', hi: 'बीमार', value: 'unwell' }
                        ].map(option => (
                            <label key={option.value} className={styles.radioLabel}>
                                <input
                                    type="radio"
                                    name="presentHealthState"
                                    value={option.value}
                                    checked={formData.presentHealthState === option.value}
                                    onChange={handleChange}
                                />
                                {language === 'hi' ? option.hi : option.en}
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
                            {t('otherHealthState')}:
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
                        2. {t('currentMedications')}
                    </label>
                    <textarea
                        id="currentMedications"
                        name="currentMedications"
                        value={formData.currentMedications || ''}
                        onChange={handleChange}
                        rows={4}
                        placeholder={t('listMedications')}
                    />
                </div>

                <div className={styles.formGroupFull}>
                    <label>3. {t('medicationAdherence')} <span style={{ color: '#ff6b35' }}>*</span></label>
                    <div className={styles.radioGroup}>
                        <label className={styles.radioLabel}>
                            <input
                                type="radio"
                                name="medicationAdherence"
                                value="yes"
                                checked={formData.medicationAdherence === 'yes'}
                                onChange={handleChange}
                            />
                            {t('yes')}
                        </label>
                        <label className={styles.radioLabel}>
                            <input
                                type="radio"
                                name="medicationAdherence"
                                value="no"
                                checked={formData.medicationAdherence === 'no'}
                                onChange={handleChange}
                            />
                            {t('no')}
                        </label>
                        <label className={styles.radioLabel}>
                            <input
                                type="radio"
                                name="medicationAdherence"
                                value="sometimes"
                                checked={formData.medicationAdherence === 'sometimes'}
                                onChange={handleChange}
                            />
                            {t('sometimes')}
                        </label>
                    </div>
                    {(formData.medicationAdherence === 'no' || formData.medicationAdherence === 'sometimes') && (
                        <div className={styles.formGroupFull} style={{ marginTop: '1rem' }}>
                            <label htmlFor="medicationAdherenceReason">
                                {t('medicationAdherenceReason')}
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
                    <label>4. {t('supplements')} <span style={{ color: '#ff6b35' }}>*</span></label>
                    <div className={styles.radioGroup}>
                        <label className={styles.radioLabel}>
                            <input
                                type="radio"
                                name="supplements"
                                value="yes"
                                checked={formData.supplements === 'yes'}
                                onChange={handleChange}
                            />
                            {t('yes')}
                        </label>
                        <label className={styles.radioLabel}>
                            <input
                                type="radio"
                                name="supplements"
                                value="no"
                                checked={formData.supplements === 'no'}
                                onChange={handleChange}
                            />
                            {t('no')}
                        </label>
                    </div>
                    {formData.supplements === 'yes' && (
                        <div className={styles.formGroupFull} style={{ marginTop: '1rem' }}>
                            <label htmlFor="supplementsList">{t('supplementsList')}</label>
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
                    <label htmlFor="lastPhysicianVisit">5. {t('lastPhysicianVisit')}</label>
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
                    <label>6. {t('cholesterolChecked')} <span style={{ color: '#ff6b35' }}>*</span></label>
                    <div className={styles.radioGroup}>
                        <label className={styles.radioLabel}>
                            <input
                                type="radio"
                                name="cholesterolChecked"
                                value="yes"
                                checked={formData.cholesterolChecked === 'yes'}
                                onChange={handleChange}
                            />
                            {t('yes')}
                        </label>
                        <label className={styles.radioLabel}>
                            <input
                                type="radio"
                                name="cholesterolChecked"
                                value="no"
                                checked={formData.cholesterolChecked === 'no'}
                                onChange={handleChange}
                            />
                            {t('no')}
                        </label>
                    </div>
                    {formData.cholesterolChecked === 'yes' && (
                        <div className={styles.formGrid} style={{ marginTop: '1rem' }}>
                            <div className={styles.formGroup}>
                                <label htmlFor="cholesterolDate">{t('cholesterolDate')}</label>
                                <input
                                    type="date"
                                    id="cholesterolDate"
                                    name="cholesterolDate"
                                    value={formData.cholesterolDate || ''}
                                    onChange={handleChange}
                                />
                            </div>
                            <div className={styles.formGroup}>
                                <label htmlFor="totalCholesterol">{t('totalCholesterol')}</label>
                                <input
                                    type="text"
                                    id="totalCholesterol"
                                    name="totalCholesterol"
                                    value={formData.totalCholesterol || ''}
                                    onChange={handleChange}
                                />
                            </div>
                            <div className={styles.formGroup}>
                                <label htmlFor="hdl">{t('hdl')}</label>
                                <input
                                    type="text"
                                    id="hdl"
                                    name="hdl"
                                    value={formData.hdl || ''}
                                    onChange={handleChange}
                                />
                            </div>
                            <div className={styles.formGroup}>
                                <label htmlFor="ldl">{t('ldl')}</label>
                                <input
                                    type="text"
                                    id="ldl"
                                    name="ldl"
                                    value={formData.ldl || ''}
                                    onChange={handleChange}
                                />
                            </div>
                            <div className={styles.formGroup}>
                                <label htmlFor="triglycerides">{t('triglycerides')}</label>
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
                    <label>7. {t('bloodSugarChecked')} <span style={{ color: '#ff6b35' }}>*</span></label>
                    <div className={styles.radioGroup}>
                        <label className={styles.radioLabel}>
                            <input
                                type="radio"
                                name="bloodSugarChecked"
                                value="yes"
                                checked={formData.bloodSugarChecked === 'yes'}
                                onChange={handleChange}
                            />
                            {t('yes')}
                        </label>
                        <label className={styles.radioLabel}>
                            <input
                                type="radio"
                                name="bloodSugarChecked"
                                value="no"
                                checked={formData.bloodSugarChecked === 'no'}
                                onChange={handleChange}
                            />
                            {t('no')}
                        </label>
                    </div>
                    {formData.bloodSugarChecked === 'yes' && (
                        <div className={styles.formGroupFull} style={{ marginTop: '1rem' }}>
                            <label htmlFor="bloodSugarResults">{t('bloodSugarResults')}</label>
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
                    <label>8. {t('medicalConditions')}</label>
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
                                            placeholder={language === 'hi' ? 'एलर्जी निर्दिष्ट करें' : 'Specify allergies'}
                                            value={formData.medicalConditions?.[key]?.details || ''}
                                            onChange={(e) => handleMedicalConditionDetails(key, e.target.value)}
                                            className={styles.detailsInput}
                                        />
                                    )}
                                    {(formData.medicalConditions?.[key]?.checked) && condition !== 'Allergies' && (
                                        <textarea
                                            placeholder={language === 'hi' ? 'विवरण' : 'Details'}
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
                    <label htmlFor="majorSurgeries">{t('majorSurgeries')}</label>
                    <textarea
                        id="majorSurgeries"
                        name="majorSurgeries"
                        value={formData.majorSurgeries || ''}
                        onChange={handleChange}
                        rows={3}
                    />
                </div>

                <div className={styles.formGroupFull}>
                    <label htmlFor="pastInjuries">{t('pastInjuries')}</label>
                    <textarea
                        id="pastInjuries"
                        name="pastInjuries"
                        value={formData.pastInjuries || ''}
                        onChange={handleChange}
                        rows={2}
                    />
                </div>

                <div className={styles.formGroupFull}>
                    <label htmlFor="otherHealthConditions">{t('otherHealthConditions')}</label>
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
        const conditionLabels: { [key: string]: { en: string; hi: string } } = {
            heartDisease: { en: 'Heart disease', hi: 'हृदय रोग' },
            highCholesterol: { en: 'High cholesterol', hi: 'उच्च कोलेस्ट्रॉल' },
            highBloodPressure: { en: 'High blood pressure', hi: 'उच्च रक्तचाप' },
            cancer: { en: 'Cancer', hi: 'कैंसर' },
            diabetes: { en: 'Diabetes', hi: 'मधुमेह' },
            osteoporosis: { en: 'Osteoporosis', hi: 'ऑस्टियोपोरोसिस' }
        }

        return (
            <div className={styles.section}>
                <h2 className={styles.sectionTitle}>{t('familyHistory')}</h2>
                <div className={styles.formGroupFull}>
                    <label>1. {t('familyHistoryQuestion')}</label>
                    {familyConditions.map(condition => (
                        <div key={condition} className={styles.familyHistoryItem}>
                            <label className={styles.checkboxLabel}>
                                <input
                                    type="checkbox"
                                    checked={formData.familyHistory?.[condition]?.checked || false}
                                    onChange={(e) => handleFamilyHistoryChange(condition, 'checked', e.target.checked)}
                                />
                                {language === 'hi' ? conditionLabels[condition].hi : conditionLabels[condition].en}
                            </label>
                            {formData.familyHistory?.[condition]?.checked && (
                                <div className={styles.formGrid} style={{ marginTop: '0.5rem' }}>
                                    <div className={styles.formGroup}>
                                        <label htmlFor={`${condition}_relation`}>{t('relation')}</label>
                                        <input
                                            type="text"
                                            id={`${condition}_relation`}
                                            value={formData.familyHistory?.[condition]?.relation || ''}
                                            onChange={(e) => handleFamilyHistoryChange(condition, 'relation', e.target.value)}
                                            placeholder={language === 'hi' ? 'जैसे, माँ, पिता, भाई-बहन' : 'e.g., Mother, Father, Sibling'}
                                        />
                                    </div>
                                    <div className={styles.formGroup}>
                                        <label htmlFor={`${condition}_age`}>{t('ageAtDiagnosis')}</label>
                                        <input
                                            type="text"
                                            id={`${condition}_age`}
                                            value={formData.familyHistory?.[condition]?.age || ''}
                                            onChange={(e) => handleFamilyHistoryChange(condition, 'age', e.target.value)}
                                            placeholder={language === 'hi' ? 'उम्र' : 'Age'}
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
        const foodPreparationOptions = [
            { en: 'Self', hi: 'स्वयं' },
            { en: 'Spouse', hi: 'पति/पत्नी' },
            { en: 'Parent', hi: 'माता-पिता' },
            { en: 'Minimal preparation', hi: 'न्यूनतम तैयारी' }
        ]

        return (
            <div className={styles.section}>
                <h2 className={styles.sectionTitle}>{t('nutrition')}</h2>

                <div className={styles.formGroupFull}>
                    <label htmlFor="dietaryGoals">1. {t('dietaryGoals')}</label>
                    <textarea
                        id="dietaryGoals"
                        name="dietaryGoals"
                        value={formData.dietaryGoals || ''}
                        onChange={handleChange}
                        rows={3}
                        placeholder={language === 'hi' ? 'अपने आहार लक्ष्यों का वर्णन करें' : 'Describe your dietary goals'}
                    />
                </div>

                <div className={styles.formGroupFull}>
                    <label>2. {t('modifiedDiet')} <span style={{ color: '#ff6b35' }}>*</span></label>
                    <div className={styles.radioGroup}>
                        <label className={styles.radioLabel}>
                            <input
                                type="radio"
                                name="modifiedDiet"
                                value="yes"
                                checked={formData.modifiedDiet === 'yes'}
                                onChange={handleChange}
                            />
                            {t('yes')}
                        </label>
                        <label className={styles.radioLabel}>
                            <input
                                type="radio"
                                name="modifiedDiet"
                                value="no"
                                checked={formData.modifiedDiet === 'no'}
                                onChange={handleChange}
                            />
                            {t('no')}
                        </label>
                    </div>
                    {formData.modifiedDiet === 'yes' && (
                        <div className={styles.formGroupFull} style={{ marginTop: '1rem' }}>
                            <label htmlFor="modifiedDietDescription">{t('modifiedDietDescription')}</label>
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
                    <label>3. {t('specializedEatingPlan')} <span style={{ color: '#ff6b35' }}>*</span></label>
                    <div className={styles.radioGroup}>
                        <label className={styles.radioLabel}>
                            <input
                                type="radio"
                                name="specializedEatingPlan"
                                value="yes"
                                checked={formData.specializedEatingPlan === 'yes'}
                                onChange={handleChange}
                            />
                            {t('yes')}
                        </label>
                        <label className={styles.radioLabel}>
                            <input
                                type="radio"
                                name="specializedEatingPlan"
                                value="no"
                                checked={formData.specializedEatingPlan === 'no'}
                                onChange={handleChange}
                            />
                            {t('no')}
                        </label>
                    </div>
                    {formData.specializedEatingPlan === 'yes' && (
                        <>
                            <div className={styles.formGroupFull} style={{ marginTop: '1rem' }}>
                                <label htmlFor="eatingPlanType">{t('eatingPlanType')}</label>
                                <input
                                    type="text"
                                    id="eatingPlanType"
                                    name="eatingPlanType"
                                    value={formData.eatingPlanType || ''}
                                    onChange={handleChange}
                                />
                            </div>
                            <div className={styles.formGroupFull}>
                                <label htmlFor="eatingPlanReason">{t('eatingPlanReason')}</label>
                                <textarea
                                    id="eatingPlanReason"
                                    name="eatingPlanReason"
                                    value={formData.eatingPlanReason || ''}
                                    onChange={handleChange}
                                    rows={2}
                                />
                            </div>
                            <div className={styles.formGroupFull}>
                                <label>{t('eatingPlanPrescribed')}</label>
                                <div className={styles.radioGroup}>
                                    <label className={styles.radioLabel}>
                                        <input
                                            type="radio"
                                            name="eatingPlanPrescribed"
                                            value="yes"
                                            checked={formData.eatingPlanPrescribed === 'yes'}
                                            onChange={handleChange}
                                        />
                                        {t('yes')}
                                    </label>
                                    <label className={styles.radioLabel}>
                                        <input
                                            type="radio"
                                            name="eatingPlanPrescribed"
                                            value="no"
                                            checked={formData.eatingPlanPrescribed === 'no'}
                                            onChange={handleChange}
                                        />
                                        {t('no')}
                                    </label>
                                </div>
                            </div>
                            <div className={styles.formGroupFull}>
                                <label htmlFor="eatingPlanDuration">{t('eatingPlanDuration')}</label>
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
                    <label>5. {t('dietitianConsultation')} <span style={{ color: '#ff6b35' }}>*</span></label>
                    <div className={styles.radioGroup}>
                        <label className={styles.radioLabel}>
                            <input
                                type="radio"
                                name="dietitianConsultation"
                                value="yes"
                                checked={formData.dietitianConsultation === 'yes'}
                                onChange={handleChange}
                            />
                            {t('yes')}
                        </label>
                        <label className={styles.radioLabel}>
                            <input
                                type="radio"
                                name="dietitianConsultation"
                                value="no"
                                checked={formData.dietitianConsultation === 'no'}
                                onChange={handleChange}
                            />
                            {t('no')}
                        </label>
                    </div>
                    {formData.dietitianConsultation === 'no' && (
                        <div className={styles.formGroupFull} style={{ marginTop: '1rem' }}>
                            <label>{t('dietitianInterest')}</label>
                            <div className={styles.radioGroup}>
                                <label className={styles.radioLabel}>
                                    <input
                                        type="radio"
                                        name="dietitianInterest"
                                        value="yes"
                                        checked={formData.dietitianInterest === 'yes'}
                                        onChange={handleChange}
                                    />
                                    {t('yes')}
                                </label>
                                <label className={styles.radioLabel}>
                                    <input
                                        type="radio"
                                        name="dietitianInterest"
                                        value="no"
                                        checked={formData.dietitianInterest === 'no'}
                                        onChange={handleChange}
                                    />
                                    {t('no')}
                                </label>
                            </div>
                        </div>
                    )}
                </div>

                <div className={styles.formGroupFull}>
                    <label htmlFor="nutritionalIssues">6. {t('nutritionalIssues')}</label>
                    <textarea
                        id="nutritionalIssues"
                        name="nutritionalIssues"
                        value={formData.nutritionalIssues || ''}
                        onChange={handleChange}
                        rows={3}
                    />
                </div>

                <div className={styles.formGroup}>
                    <label htmlFor="waterIntake">7. {t('waterIntake')}</label>
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
                        <span>{language === 'hi' ? '8-औंस गिलास' : '8-ounce glasses'}</span>
                    </div>
                </div>

                <div className={styles.formGroupFull}>
                    <label htmlFor="otherBeverages">8. {t('otherBeverages')}</label>
                    <textarea
                        id="otherBeverages"
                        name="otherBeverages"
                        value={formData.otherBeverages || ''}
                        onChange={handleChange}
                        rows={2}
                    />
                </div>

                <div className={styles.formGroupFull}>
                    <label>9. {t('foodAllergies')} <span style={{ color: '#ff6b35' }}>*</span></label>
                    <div className={styles.radioGroup}>
                        <label className={styles.radioLabel}>
                            <input
                                type="radio"
                                name="foodAllergies"
                                value="yes"
                                checked={formData.foodAllergies === 'yes'}
                                onChange={handleChange}
                            />
                            {t('yes')}
                        </label>
                        <label className={styles.radioLabel}>
                            <input
                                type="radio"
                                name="foodAllergies"
                                value="no"
                                checked={formData.foodAllergies === 'no'}
                                onChange={handleChange}
                            />
                            {t('no')}
                        </label>
                    </div>
                    {formData.foodAllergies === 'yes' && (
                        <div className={styles.formGroupFull} style={{ marginTop: '1rem' }}>
                            <label htmlFor="foodAllergiesList">{t('foodAllergiesList')}</label>
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
                    <label>10. {t('foodPreparation')}</label>
                    <div className={styles.checkboxGroup}>
                        {foodPreparationOptions.map(option => (
                            <label key={option.en} className={styles.checkboxLabel}>
                                <input
                                    type="checkbox"
                                    name={`foodPreparation_${option.en.toLowerCase().replace(' ', '_')}`}
                                    checked={formData.foodPreparation?.includes(option.en.toLowerCase().replace(' ', '_')) || false}
                                    onChange={handleChange}
                                />
                                {language === 'hi' ? option.hi : option.en}
                            </label>
                        ))}
                    </div>
                </div>

                <div className={styles.formGroup}>
                    <label htmlFor="dineOutFrequency">11. {t('dineOutFrequency')}</label>
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
                        <span>{language === 'hi' ? 'सप्ताह में बार' : 'times per week'}</span>
                    </div>
                </div>

                <div className={styles.formGroupFull}>
                    <label>12. {language === 'hi' ? 'कृपया प्रत्येक भोजन के लिए रेस्तरां के प्रकार निर्दिष्ट करें:' : 'Please specify the type of restaurants for each meal:'}</label>
                    <div className={styles.formGrid}>
                        <div className={styles.formGroup}>
                            <label htmlFor="restaurantBreakfast">{t('restaurantBreakfast')}</label>
                            <input
                                type="text"
                                id="restaurantBreakfast"
                                name="restaurantBreakfast"
                                value={formData.restaurantBreakfast || ''}
                                onChange={handleChange}
                            />
                        </div>
                        <div className={styles.formGroup}>
                            <label htmlFor="restaurantLunch">{t('restaurantLunch')}</label>
                            <input
                                type="text"
                                id="restaurantLunch"
                                name="restaurantLunch"
                                value={formData.restaurantLunch || ''}
                                onChange={handleChange}
                            />
                        </div>
                        <div className={styles.formGroup}>
                            <label htmlFor="restaurantDinner">{t('restaurantDinner')}</label>
                            <input
                                type="text"
                                id="restaurantDinner"
                                name="restaurantDinner"
                                value={formData.restaurantDinner || ''}
                                onChange={handleChange}
                            />
                        </div>
                        <div className={styles.formGroup}>
                            <label htmlFor="restaurantSnacks">{t('restaurantSnacks')}</label>
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
                    <label>13. {t('foodCravings')} <span style={{ color: '#ff6b35' }}>*</span></label>
                    <div className={styles.radioGroup}>
                        <label className={styles.radioLabel}>
                            <input
                                type="radio"
                                name="foodCravings"
                                value="yes"
                                checked={formData.foodCravings === 'yes'}
                                onChange={handleChange}
                            />
                            {t('yes')}
                        </label>
                        <label className={styles.radioLabel}>
                            <input
                                type="radio"
                                name="foodCravings"
                                value="no"
                                checked={formData.foodCravings === 'no'}
                                onChange={handleChange}
                            />
                            {t('no')}
                        </label>
                    </div>
                    {formData.foodCravings === 'yes' && (
                        <div className={styles.formGroupFull} style={{ marginTop: '1rem' }}>
                            <label htmlFor="foodCravingsList">{t('foodCravingsList')}</label>
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
                <h2 className={styles.sectionTitle}>{t('substanceHabits')}</h2>

                <div className={styles.formGroupFull}>
                    <label>1. {t('alcohol')} <span style={{ color: '#ff6b35' }}>*</span></label>
                    <div className={styles.radioGroup}>
                        <label className={styles.radioLabel}>
                            <input
                                type="radio"
                                name="alcohol"
                                value="yes"
                                checked={formData.alcohol === 'yes'}
                                onChange={handleChange}
                            />
                            {t('yes')}
                        </label>
                        <label className={styles.radioLabel}>
                            <input
                                type="radio"
                                name="alcohol"
                                value="no"
                                checked={formData.alcohol === 'no'}
                                onChange={handleChange}
                            />
                            {t('no')}
                        </label>
                    </div>
                    {formData.alcohol === 'yes' && (
                        <div className={styles.formGrid} style={{ marginTop: '1rem' }}>
                            <div className={styles.formGroup}>
                                <label htmlFor="alcoholFrequency">{t('alcoholFrequency')}</label>
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
                                    <span>{language === 'hi' ? 'सप्ताह में बार' : 'times per week'}</span>
                                </div>
                            </div>
                            <div className={styles.formGroup}>
                                <label htmlFor="alcoholAmount">{t('alcoholAmount')}</label>
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
                    <label>2. {t('caffeinatedBeverages')} <span style={{ color: '#ff6b35' }}>*</span></label>
                    <div className={styles.radioGroup}>
                        <label className={styles.radioLabel}>
                            <input
                                type="radio"
                                name="caffeinatedBeverages"
                                value="yes"
                                checked={formData.caffeinatedBeverages === 'yes'}
                                onChange={handleChange}
                            />
                            {t('yes')}
                        </label>
                        <label className={styles.radioLabel}>
                            <input
                                type="radio"
                                name="caffeinatedBeverages"
                                value="no"
                                checked={formData.caffeinatedBeverages === 'no'}
                                onChange={handleChange}
                            />
                            {t('no')}
                        </label>
                    </div>
                    {formData.caffeinatedBeverages === 'yes' && (
                        <div className={styles.formGroupFull} style={{ marginTop: '1rem' }}>
                            <label htmlFor="caffeineAmount">{t('caffeineAmount')}</label>
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
                    <label>3. {t('tobacco')} <span style={{ color: '#ff6b35' }}>*</span></label>
                    <div className={styles.radioGroup}>
                        <label className={styles.radioLabel}>
                            <input
                                type="radio"
                                name="tobacco"
                                value="yes"
                                checked={formData.tobacco === 'yes'}
                                onChange={handleChange}
                            />
                            {t('yes')}
                        </label>
                        <label className={styles.radioLabel}>
                            <input
                                type="radio"
                                name="tobacco"
                                value="no"
                                checked={formData.tobacco === 'no'}
                                onChange={handleChange}
                            />
                            {t('no')}
                        </label>
                    </div>
                    {formData.tobacco === 'yes' && (
                        <div className={styles.formGroupFull} style={{ marginTop: '1rem' }}>
                            <label htmlFor="tobaccoAmount">{t('tobaccoAmount')}</label>
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
                <h2 className={styles.sectionTitle}>{t('physicalActivity')}</h2>

                <div className={styles.formGroupFull}>
                    <label>1. {t('structuredActivity')} <span style={{ color: '#ff6b35' }}>*</span></label>
                    <div className={styles.radioGroup}>
                        <label className={styles.radioLabel}>
                            <input
                                type="radio"
                                name="structuredActivity"
                                value="yes"
                                checked={formData.structuredActivity === 'yes'}
                                onChange={handleChange}
                            />
                            {t('yes')}
                        </label>
                        <label className={styles.radioLabel}>
                            <input
                                type="radio"
                                name="structuredActivity"
                                value="no"
                                checked={formData.structuredActivity === 'no'}
                                onChange={handleChange}
                            />
                            {t('no')}
                        </label>
                    </div>
                    {formData.structuredActivity === 'yes' && (
                        <div className={styles.formGrid} style={{ marginTop: '1rem' }}>
                            <div className={styles.formGroup}>
                                <label htmlFor="cardioMinutes">{language === 'hi' ? 'हृदय-श्वसन गतिविधि:' : 'Cardiorespiratory activity:'}</label>
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
                                <label htmlFor="cardioTimesPerWeek">{t('cardioTimesPerWeek')}</label>
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
                                <label htmlFor="muscularTrainingSessions">{t('muscularTrainingSessions')}</label>
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
                                <label htmlFor="flexibilitySessions">{t('flexibilitySessions')}</label>
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
                                <label htmlFor="sportsMinutes">{t('sportsMinutes')}</label>
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
                                <label htmlFor="sportsActivities">{t('sportsActivities')}</label>
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
                    <label>2. {t('otherPhysicalActivity')} <span style={{ color: '#ff6b35' }}>*</span></label>
                    <div className={styles.radioGroup}>
                        <label className={styles.radioLabel}>
                            <input
                                type="radio"
                                name="otherPhysicalActivity"
                                value="yes"
                                checked={formData.otherPhysicalActivity === 'yes'}
                                onChange={handleChange}
                            />
                            {t('yes')}
                        </label>
                        <label className={styles.radioLabel}>
                            <input
                                type="radio"
                                name="otherPhysicalActivity"
                                value="no"
                                checked={formData.otherPhysicalActivity === 'no'}
                                onChange={handleChange}
                            />
                            {t('no')}
                        </label>
                    </div>
                    {formData.otherPhysicalActivity === 'yes' && (
                        <div className={styles.formGroupFull} style={{ marginTop: '1rem' }}>
                            <label htmlFor="otherPhysicalActivityDescription">{t('otherPhysicalActivityDescription')}</label>
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
                    <label>3. {t('activityInjuries')} <span style={{ color: '#ff6b35' }}>*</span></label>
                    <div className={styles.radioGroup}>
                        <label className={styles.radioLabel}>
                            <input
                                type="radio"
                                name="activityInjuries"
                                value="yes"
                                checked={formData.activityInjuries === 'yes'}
                                onChange={handleChange}
                            />
                            {t('yes')}
                        </label>
                        <label className={styles.radioLabel}>
                            <input
                                type="radio"
                                name="activityInjuries"
                                value="no"
                                checked={formData.activityInjuries === 'no'}
                                onChange={handleChange}
                            />
                            {t('no')}
                        </label>
                    </div>
                    {formData.activityInjuries === 'yes' && (
                        <div className={styles.formGroupFull} style={{ marginTop: '1rem' }}>
                            <label htmlFor="activityInjuriesDescription">{t('activityInjuriesDescription')}</label>
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
                    <label htmlFor="activityRestrictions">4. {t('activityRestrictions')}</label>
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
                <h2 className={styles.sectionTitle}>{t('occupational')}</h2>

                <div className={styles.formGroupFull}>
                    <label>1. {t('work')} <span style={{ color: '#ff6b35' }}>*</span></label>
                    <div className={styles.radioGroup}>
                        <label className={styles.radioLabel}>
                            <input
                                type="radio"
                                name="work"
                                value="yes"
                                checked={formData.work === 'yes'}
                                onChange={handleChange}
                            />
                            {t('yes')}
                        </label>
                        <label className={styles.radioLabel}>
                            <input
                                type="radio"
                                name="work"
                                value="no"
                                checked={formData.work === 'no'}
                                onChange={handleChange}
                            />
                            {t('no')}
                        </label>
                    </div>
                    {formData.work === 'yes' && (
                        <>
                            <div className={styles.formGroupFull} style={{ marginTop: '1rem' }}>
                                <label htmlFor="occupation">{t('occupation')}</label>
                                <input
                                    type="text"
                                    id="occupation"
                                    name="occupation"
                                    value={formData.occupation || ''}
                                    onChange={handleChange}
                                />
                            </div>
                            <div className={styles.formGroupFull}>
                                <label htmlFor="workSchedule">{t('workSchedule')}</label>
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
                    <label htmlFor="workActivityLevel">2. {t('workActivityLevel')}</label>
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
                <h2 className={styles.sectionTitle}>{t('sleepAndStress')}</h2>

                <div className={styles.formGroup}>
                    <label htmlFor="sleepHours">1. {t('sleepHours')}</label>
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
                    <label htmlFor="stressLevel">2. {t('stressLevel')}</label>
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
                    <label htmlFor="stressCauses">3. {t('stressCauses')}</label>
                    <input
                        type="text"
                        id="stressCauses"
                        name="stressCauses"
                        value={formData.stressCauses || ''}
                        onChange={handleChange}
                    />
                </div>

                <div className={styles.formGroupFull}>
                    <label>4. {t('stressAppetite')} <span style={{ color: '#ff6b35' }}>*</span></label>
                    <div className={styles.radioGroup}>
                        <label className={styles.radioLabel}>
                            <input
                                type="radio"
                                name="stressAppetite"
                                value="increased"
                                checked={formData.stressAppetite === 'increased'}
                                onChange={handleChange}
                            />
                            {language === 'hi' ? 'बढ़ गया' : 'Increased'}
                        </label>
                        <label className={styles.radioLabel}>
                            <input
                                type="radio"
                                name="stressAppetite"
                                value="not_affected"
                                checked={formData.stressAppetite === 'not_affected'}
                                onChange={handleChange}
                            />
                            {language === 'hi' ? 'प्रभावित नहीं' : 'Not affected'}
                        </label>
                        <label className={styles.radioLabel}>
                            <input
                                type="radio"
                                name="stressAppetite"
                                value="decreased"
                                checked={formData.stressAppetite === 'decreased'}
                                onChange={handleChange}
                            />
                            {language === 'hi' ? 'कम हो गया' : 'Decreased'}
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
                <h2 className={styles.sectionTitle}>{t('weightHistory')}</h2>

                <div className={styles.formGroup}>
                    <label htmlFor="presentWeight">1. {t('presentWeight')}</label>
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
                            {t('presentWeightUnknown')}
                        </label>
                    </div>
                </div>

                <div className={styles.formGroupFull}>
                    <label>2. {t('weightGoal')} <span style={{ color: '#ff6b35' }}>*</span></label>
                    <div className={styles.radioGroup}>
                        <label className={styles.radioLabel}>
                            <input
                                type="radio"
                                name="weightGoal"
                                value="lose_weight"
                                checked={formData.weightGoal === 'lose_weight'}
                                onChange={handleChange}
                            />
                            {language === 'hi' ? 'वजन कम करें' : 'Lose weight'}
                        </label>
                        <label className={styles.radioLabel}>
                            <input
                                type="radio"
                                name="weightGoal"
                                value="gain_weight"
                                checked={formData.weightGoal === 'gain_weight'}
                                onChange={handleChange}
                            />
                            {language === 'hi' ? 'वजन बढ़ाएं' : 'Gain weight'}
                        </label>
                        <label className={styles.radioLabel}>
                            <input
                                type="radio"
                                name="weightGoal"
                                value="maintain_weight"
                                checked={formData.weightGoal === 'maintain_weight'}
                                onChange={handleChange}
                            />
                            {language === 'hi' ? 'वजन बनाए रखें' : 'Maintain weight'}
                        </label>
                    </div>
                </div>

                <div className={styles.formGroup}>
                    <label htmlFor="lowestWeight5Years">3. {t('lowestWeight5Years')}</label>
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
                    <label htmlFor="highestWeight5Years">4. {t('highestWeight5Years')}</label>
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
                    <label htmlFor="idealWeight">5. {t('idealWeight')}</label>
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
                            {t('presentWeightUnknown')}
                        </label>
                    </div>
                </div>

                <div className={styles.formGroupFull}>
                    <label>6. {language === 'hi' ? 'आपकी वर्तमान कमर और कूल्हे की परिधि क्या है?' : 'What are your current waist and hip circumferences?'}</label>
                    <div className={styles.formGrid}>
                        <div className={styles.formGroup}>
                            <label htmlFor="waistCircumference">{t('waistCircumference')}</label>
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
                            <label htmlFor="hipCircumference">{t('hipCircumference')}</label>
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
                    <label htmlFor="bodyComposition">7. {t('bodyComposition')}</label>
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
                            placeholder={language === 'hi' ? '% शरीर वसा' : '% body fat'}
                            disabled={formData.bodyCompositionUnknown}
                        />
                        <label className={styles.checkboxLabel} style={{ margin: 0 }}>
                            <input
                                type="checkbox"
                                name="bodyCompositionUnknown"
                                checked={formData.bodyCompositionUnknown || false}
                                onChange={handleChange}
                            />
                            {t('bodyCompositionUnknown')}
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
                <h2 className={styles.sectionTitle}>{t('goals')}</h2>

                <div className={styles.formGroup}>
                    <label htmlFor="lifestyleAdoptionLikelihood">1. {t('lifestyleAdoptionLikelihood')}</label>
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
                    <label>2. {t('specificHealthGoals')} <span style={{ color: '#ff6b35' }}>*</span></label>
                    <div className={styles.radioGroup}>
                        <label className={styles.radioLabel}>
                            <input
                                type="radio"
                                name="specificHealthGoals"
                                value="yes"
                                checked={formData.specificHealthGoals === 'yes'}
                                onChange={handleChange}
                            />
                            {t('yes')}
                        </label>
                        <label className={styles.radioLabel}>
                            <input
                                type="radio"
                                name="specificHealthGoals"
                                value="no"
                                checked={formData.specificHealthGoals === 'no'}
                                onChange={handleChange}
                            />
                            {t('no')}
                        </label>
                    </div>
                    {formData.specificHealthGoals === 'yes' && (
                        <div className={styles.formGroupFull} style={{ marginTop: '1rem' }}>
                            <label htmlFor="healthGoalsList">{t('healthGoalsList')}</label>
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
                    <label>3. {t('weightLossGoal')} <span style={{ color: '#ff6b35' }}>*</span></label>
                    <div className={styles.radioGroup}>
                        <label className={styles.radioLabel}>
                            <input
                                type="radio"
                                name="weightLossGoal"
                                value="yes"
                                checked={formData.weightLossGoal === 'yes'}
                                onChange={handleChange}
                            />
                            {t('yes')}
                        </label>
                        <label className={styles.radioLabel}>
                            <input
                                type="radio"
                                name="weightLossGoal"
                                value="no"
                                checked={formData.weightLossGoal === 'no'}
                                onChange={handleChange}
                            />
                            {t('no')}
                        </label>
                    </div>
                    {formData.weightLossGoal === 'yes' && (
                        <div className={styles.formGroupFull} style={{ marginTop: '1rem' }}>
                            <label htmlFor="weightLossGoalAmount">{t('weightLossGoalAmount')}</label>
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
                    <label htmlFor="weightLossImportance">4. {t('weightLossImportance')}</label>
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
