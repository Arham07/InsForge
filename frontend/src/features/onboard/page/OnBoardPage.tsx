import { useState, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Button } from '@/components/radix/Button';
import { useOnboardStep, STEP_DESCRIPTIONS } from '@/lib/contexts/OnboardStepContext';
import { type OnboardStep } from '../types';
import { LinearStepper } from '@/components/Stepper';
import { StepContent } from '../components/StepContent';
import { CompletionCard } from '../components/CompletionCard';

export default function OnBoardPage() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const { currentStep, updateStep, totalSteps } = useOnboardStep();
  const [isCompleted, setIsCompleted] = useState(false);

  // Handle reinstall with step parameter
  useEffect(() => {
    const stepParam = searchParams.get('step');
    if (stepParam === '1') {
      updateStep(1);
      setIsCompleted(false);
      setSearchParams({});
    }
  }, [searchParams, setSearchParams, updateStep]);

  const handleDismiss = async () => {
    await navigate('/dashboard');
  };

  const handleNext = () => {
    if (currentStep < totalSteps) {
      updateStep((currentStep + 1) as OnboardStep);
    } else if (currentStep === totalSteps) {
      setIsCompleted(true);
    }
  };

  const handleBack = () => {
    if (currentStep > 1) {
      updateStep((currentStep - 1) as OnboardStep);
    }
  };

  return (
    <div className="min-h-screen bg-bg-gray dark:bg-neutral-800">
      <div className="container max-w-[1080px] mx-auto px-6 py-12">
        {/* Header with Linear Stepper */}
        <div className="mb-12 space-y-3">
          <h1 className="text-2xl font-bold text-black dark:text-white">Get Started</h1>
          <LinearStepper
            currentStep={currentStep}
            totalSteps={totalSteps}
            stepLabels={STEP_DESCRIPTIONS}
            isCompleted={isCompleted}
          />
        </div>

        {/* Main Content Card */}
        {isCompleted ? (
          <CompletionCard />
        ) : (
          <div className="space-y-3">
            <p className="text-black dark:text-white text-lg font-semibold">
              {STEP_DESCRIPTIONS[currentStep - 1]}
            </p>
            <StepContent step={currentStep} />

            {/* Action Buttons */}
            <div className="flex justify-between items-center">
              {/* Dismiss Button - Left */}
              <Button
                variant="outline"
                onClick={() => void handleDismiss()}
                className="h-10 w-30 py-2 text-zinc-950 dark:text-white dark:border-neutral-500"
              >
                Dismiss
              </Button>

              {/* Navigation Buttons - Right */}
              <div className="flex space-x-4">
                {currentStep > 1 && (
                  <Button
                    variant="outline"
                    onClick={() => void handleBack()}
                    className="h-10 w-30 text-zinc-950 dark:text-white dark:border-neutral-500"
                  >
                    Back
                  </Button>
                )}
                <Button
                  variant="default"
                  onClick={() => void handleNext()}
                  className="h-10 w-30 dark:bg-emerald-300 dark:text-black dark:hover:bg-emerald-200"
                >
                  {currentStep === totalSteps ? 'Complete' : 'Next'}
                </Button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
