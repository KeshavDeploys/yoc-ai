# **Face samples are captured at \~12 FPS (about 12 samples/sec), while Pose samples are \~4 FPS (about 4 samples/sec).**





\## 1. What the camera scorer is actually doing RIGHT NOW



Important distinction:



\### Current system



We currently have \*\*5 scoring categories\*\*:



1\. Presence

2\. Framing

3\. Head Control

4\. Posture

5\. Stability



Then those 5 are combined into the current overall score.



We \*\*do not yet have\*\* the final 7 metrics you proposed:



\* Camera Engagement

\* Posture

\* Facial Expressiveness

\* Head Stability

\* Framing

\* Visual Quality

\* Presence Stability



That seven-score system should be our \*\*next scoring redesign\*\*, not something we pretend already exists.



\---



\# 2. Current raw telemetry



During the interview, we're collecting things like:



\### Face



\* face detected

\* face visibility

\* face visibility %

\* face width

\* face height

\* face center

\* framing state

\* centered/not centered



\### Head



\* yaw

\* pitch

\* roll

\* calibrated baseline

\* deviation from baseline

\* centered %

\* looking-away %

\* movement level

\* head stability



\### Upper body



\* shoulder visibility

\* shoulder tilt

\* posture classification

\* body centering

\* body stability

\* good posture %



\### Eye telemetry



\* eyes closed

\* left eye openness

\* right eye openness

\* average eye openness

\* eye samples



\*\*Blink count/rate is no longer part of this.\*\*



\---



\# 3. Current `Presence`



This is extremely simple right now.



```text

Presence = Face Visibility %

```



So if during the valid session:



```text

Face visible = 930 samples

Face samples = 1000

```



then:



```text

Presence = 930 / 1000 × 100

&#x20;        = 93

```



The scorer clamps it between 0 and 100. 



\### Example



```text

Face Visibility = 97%

```



→



```text

Presence = 97

```



\---



\# 4. Current `Framing`



This one is:



```text

Framing =

&#x20;   Good Framing % × 0.70

&#x20; + Centered Face % × 0.30

```



So \*\*good framing matters more than centering\*\*.



For example:



```text

Good Framing = 90%

Centered Face = 80%

```



Then:



```text

90 × 0.70 = 63

80 × 0.30 = 24



Framing = 87

```



So:



\### Framing = 87/100



That's the actual current formula. 



\---



\# 5. Current `Head Control`



This is slightly more interesting.



We have:



```text

Head Centered %

```



and



```text

Looking Away %

```



First:



```text

Centered Component

=

Head Centered %

```



Then:



```text

Away Component =

100 - (Looking Away % × 2)

```



clamped between 0 and 100.



So:



| Looking Away | Away Component |

| -----------: | -------------: |

|           0% |            100 |

|          10% |             80 |

|          25% |             50 |

|          50% |              0 |



Then:



```text

Head Control =

&#x20;   Head Centered % × 0.60

&#x20; + Away Component × 0.40

```



The current implementation explicitly tries \*\*not\*\* to penalize someone simply for moving naturally. 



\### Example



Suppose:



```text

Head centered = 90%

Looking away = 10%

```



Then:



```text

Away Component = 100 - (10 × 2)

&#x20;              = 80

```



Therefore:



```text

Head Control =

90 × 0.60 +

80 × 0.40



= 54 + 32



= 86

```



\### Head Control = 86



\---



\# 6. Current `Posture`



Current formula:



```text

Posture =

&#x20;   Good Posture % × 0.75

&#x20; + Body Centered % × 0.25

```



So posture quality gets \*\*75% weight\*\*, body centering gets \*\*25%\*\*. 



Example:



```text

Good posture = 88%

Body centered = 92%

```



Then:



```text

88 × 0.75 = 66

92 × 0.25 = 23



Posture = 89

```



So:



\### Posture = 89/100



\---



\# ⚠️ One important thing here



You told me:



> I don't want any hips involvement. Keep it till shoulders only.



But our \*\*current `UpperBodyAnalyzer` implementation still expects hips\*\* to calculate `torsoLean`.



So although we've preserved the scoring architecture, the current posture telemetry isn't yet fully aligned with your requirement.



That's something we should fix \*\*before finalizing the production scoring model\*\*.



We should make posture genuinely:



```text

Shoulder visibility

&#x20;     ↓

Shoulder tilt

&#x20;     ↓

Shoulder alignment

&#x20;     ↓

Upper-body centering

&#x20;     ↓

Posture stability

```



No hip dependency.



\---



\# 7. Current `Stability`



This combines two existing stability scores:



```text

Head Stability × 0.55

\+

Body Stability × 0.45

```



So:



```text

Stability =

&#x20;   Head Stability × 55%

&#x20; + Body Stability × 45%

```







Example:



```text

Head Stability = 90

Body Stability = 80

```



Then:



```text

90 × .55 = 49.5

80 × .45 = 36



Stability = 85.5

```



Rounded:



\### Stability = 86/100



\---



\# 8. And finally: CURRENT overall score



This is the biggest thing to understand.



Currently:



```text

Presence      20%

Framing       15%

Head Control  25%

Posture       25%

Stability     15%

```



The scorer literally calculates:



```text

Overall =

&#x20;   Presence × 0.20

&#x20; + Framing × 0.15

&#x20; + Head Control × 0.25

&#x20; + Posture × 0.25

&#x20; + Stability × 0.15

```



These are explicitly described as \*\*MVP heuristic weights\*\*, not psychological or clinical measurements. 



\### Example



Suppose:



```text

Presence      = 95

Framing       = 90

Head Control  = 86

Posture       = 89

Stability     = 92

```



Then:



```text

95 × .20 = 19.0

90 × .15 = 13.5

86 × .25 = 21.5

89 × .25 = 22.25

92 × .15 = 13.8

\----------------

&#x20;            90.05

```



Final:



\# 90/100



\---



\# 9. Reliability is separate



This is important.



The scorer doesn't simply say:



> "You had a high score, therefore the analysis is reliable."



It checks whether enough samples were collected.



Current minimums:



```text

Face samples ≥ 60

Head samples ≥ 30

Pose samples ≥ 20

```



If any aren't met, the result becomes unreliable.  



\*\*Reliability currently does not mathematically reduce the score.\*\*



It simply tells us:



```text

Score: 87

Reliable: false

Reason: Not enough pose samples...

```



That's actually a good separation.



\---



\# 10. But this is NOT our final scoring model



This is the important part.



Your proposed product model is much better:



```text

&#x20;                   CAMERA PERFORMANCE

&#x20;                          │

&#x20;       ┌──────────────────┼──────────────────┐

&#x20;       │                  │                  │

&#x20;    BEHAVIOR             SETUP          PRESENCE

&#x20;       │                  │                  │

&#x20;       ├─ Camera          ├─ Framing        └─ Presence

&#x20;       │  Engagement      └─ Visual Quality    Stability

&#x20;       │

&#x20;       ├─ Posture

&#x20;       ├─ Facial

&#x20;       │  Expressiveness

&#x20;       └─ Head Stability

```



Giving:



| Final metric          | Current?                            |

| --------------------- | ----------------------------------- |

| Camera Engagement     | ❌                                   |

| Posture               | ⚠️ exists, needs refinement         |

| Facial Expressiveness | ❌                                   |

| Head Stability        | ⚠️ exists as Head Control/Stability |

| Framing               | ✅                                   |

| Visual Quality        | ❌                                   |

| Presence Stability    | ❌                                   |



So \*\*I would not change the seven-score formulas blindly yet.\*\*



We should first finish the telemetry required for them.



Your own project specification explicitly says the seven final scores should be implemented \*\*after the telemetry layer is complete\*\*, rather than inventing arbitrary formulas prematurely. 



\---



\# 11. Where Presentation Consistency fits



This is something I really like for YOC.ai.



It should \*\*not\*\* become an eighth score.



Instead:



```text

Raw telemetry

&#x20;     ↓

Presentation Consistency

&#x20;     ↓

Final scoring

```



For example:



```text

Valid presentation samples = 656

Good presentation samples  = 501



Consistency =

501 / 656 × 100



= 76.37%

```



So:



```text

Presentation Consistency = 76.4%

```



The intended definition is exactly this:



> Good Presentation Samples / Valid Presentation Samples × 100. 



And importantly, blinking, tiny landmark noise, normal facial movement, normal head movement, etc. should \*\*not\*\* make a sample unstable. 



That's going to be very useful for the eventual scoring model.



\---



\# 12. Facial Expressiveness



This is currently the biggest missing piece.



Right now:



```text

Face landmarks

&#x20;       ↓

Face visibility

Head pose

Eye openness

```



But we aren't yet calculating:



```text

expression variation

```



So I would \*\*not fake a Facial Expressiveness score\*\* from eye openness.



We need actual facial-expression telemetry first.



Potentially:



```text

Face landmarks

&#x20;     ↓

mouth movement

eyebrow movement

cheek/jaw movement

expression variance

&#x20;     ↓

temporal smoothing

&#x20;     ↓

natural expression score

```



And, importantly:



\*\*Blinking = irrelevant.\*\*



Your specification explicitly says blink count/rate should not contribute to Facial Expressiveness. 



\---



\# 13. Visual Quality



Same story.



We currently have:



```text

Face visible

Face detection reliability

Face framing

```



But we \*\*do not currently measure actual lighting\*\*.



So we should not produce:



```text

Visual Quality = 89

```



and pretend that means webcam quality/lighting.



Your specification explicitly says not to invent lighting measurements that the engine doesn't actually measure. 



We can later add actual:



```text

brightness

contrast

face illumination

overexposure

underexposure

```



if we decide they're worthwhile.



\---



\# 14. The final architecture I recommend



Once we're finished:



```text

&#x20;                   CAMERA

&#x20;                     │

&#x20;                     ▼

&#x20;             MediaPipe Models

&#x20;                     │

&#x20;         ┌───────────┼───────────┐

&#x20;         ▼           ▼           ▼

&#x20;       FACE         HEAD        POSE

&#x20;         │           │           │

&#x20;         ▼           ▼           ▼

&#x20;     Visibility   Movement    Shoulders

&#x20;     Framing      Calibration  Posture

&#x20;     Expression   Stability    Stability

&#x20;         │           │           │

&#x20;         └───────────┼───────────┘

&#x20;                     ▼

&#x20;             Session Aggregator

&#x20;                     │

&#x20;                     ▼

&#x20;            Presentation Metrics

&#x20;                     │

&#x20;       ┌─────────────┼──────────────┐

&#x20;       ▼             ▼              ▼

&#x20;  Consistency    7 Final Scores    Raw Data

&#x20;                                    │

&#x20;                                    ▼

&#x20;                             JSON report

&#x20;                                    │

&#x20;                                    ▼

&#x20;                               Lite AI model

&#x20;                                    │

&#x20;                                    ▼

&#x20;                         Human-readable feedback

```



That separation is \*\*much cleaner\*\* than having an LLM directly interpret raw MediaPipe landmarks.



\---



\# 15. And about the small AI model



For the eventual JSON → AI analysis layer, \*\*do not send raw landmarks to the model\*\*.



Instead send something like:



```json

{

&#x20; "camera\_performance": {

&#x20;   "overall": 87,

&#x20;   "camera\_engagement": 82,

&#x20;   "posture": 88,

&#x20;   "facial\_expressiveness": 79,

&#x20;   "head\_stability": 86,

&#x20;   "framing": 92,

&#x20;   "visual\_quality": 89,

&#x20;   "presence\_stability": 95

&#x20; },



&#x20; "telemetry": {

&#x20;   "looking\_away\_percent": 8.4,

&#x20;   "face\_visibility\_percent": 97.2,

&#x20;   "good\_framing\_percent": 91.5,

&#x20;   "good\_posture\_percent": 88.2,

&#x20;   "presentation\_consistency": 94.1

&#x20; }

}

```



Then the AI only needs to answer:



```text

What did the candidate do well?

What should they improve?

What are the 2-3 most important recommendations?

```



That's \*\*tiny input\*\*, cheap, fast, and much easier to control.



\### For a lightweight model



For this particular job, I'd look at \*\*Gemini 2.5 Flash-Lite\*\* as the first candidate: it's designed for lightweight/high-volume inference and is a much better fit than throwing a large reasoning model at a small structured JSON report.



You don't need a huge model for:



```text

JSON

&#x20;↓

interpret scores

&#x20;↓

generate feedback

```



The deterministic scoring should remain \*\*your TypeScript code\*\*.



The AI should be the \*\*explanation layer\*\*, not the scoring authority.



\---



\## So our next sequence should be:



\*\*1.\*\* Permanently remove blink count/rate ✅

\*\*2.\*\* Fix posture so it is \*\*shoulder-only\*\* ⬅️

\*\*3.\*\* Add/finalize Presentation Consistency

\*\*4.\*\* Add facial-expression telemetry

\*\*5.\*\* Add actual visual-quality telemetry

\*\*6.\*\* Design the \*\*seven final formulas together\*\*

\*\*7.\*\* Test them against several recorded sessions

\*\*8.\*\* Freeze the scoring engine

\*\*9.\*\* Produce a clean JSON report

\*\*10.\*\* Feed that JSON to a lightweight AI model for feedback



And \*\*only after #8\*\* should we make the beautiful final UI.



That way we're not constantly rebuilding the UI every time we discover that a score formula needs changing.



