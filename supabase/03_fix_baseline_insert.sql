-- Fix: Allow users to insert and update their own Golden Baselines
CREATE POLICY "Users can insert own baseline" 
ON public.golden_baselines FOR INSERT 
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own baseline" 
ON public.golden_baselines FOR UPDATE 
USING (auth.uid() = user_id);
