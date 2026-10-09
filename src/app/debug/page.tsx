"use client";

import { useEffect, useRef, useState } from "react";

import {
  PresentationEngine,
  type PresentationEngineDiagnostics,
  type PresentationScoreResult,
} from "@/presentation-engine/PresentationEngine";

import type {
  PresentationSessionReport,
  PresentationAiPayload,
  PresentationAiResponse,
} from "@/presentation-engine/reporting/SessionReportSerializer";


/*
 * ==========================================
 * INITIAL STATE
 * ==========================================
 */

function createInitialDiagnostics(): PresentationEngineDiagnostics {
  return {
    status: "idle",

    camera: null,

    face: {
      modelReady: false,
      detected: false,
      targetFps: 12,
      actualFps: 0,
      latencyMs: 0,
      averageLatencyMs: 0,
      processedFrames: 0,
    },

    pose: {
      modelReady: false,
      detected: false,
      targetFps: 4,
      actualFps: 0,
      latencyMs: 0,
      averageLatencyMs: 0,
      processedFrames: 0,
    },

    headPose: null,

    calibration: {
      status: "idle",
      sampleCount: 0,
      targetSamples: 30,
      progress: 0,
      baseline: null,
      calibratedHead: null,
    },

    headMovement: null,

    faceVisibility: null,

    blink: null,

    facialExpressiveness: null,

    upperBody: null,
  };
}


/*
 * ==========================================
 * PAGE
 * ==========================================
 */

export default function DebugPage() {
  const videoRef =
    useRef<HTMLVideoElement | null>(null);

  const engineRef =
    useRef<PresentationEngine | null>(null);


  const [diagnostics, setDiagnostics] =
    useState<PresentationEngineDiagnostics>(
      createInitialDiagnostics(),
    );


  const [sessionResult, setSessionResult] =
    useState<PresentationScoreResult | null>(
      null,
    );


  const [sessionReport, setSessionReport] =
    useState<PresentationSessionReport | null>(
      null,
    );


  const [aiPayload, setAiPayload] =
    useState<PresentationAiPayload | null>(
      null,
    );


  const [aiAnalysis, setAiAnalysis] =
    useState<PresentationAiResponse | null>(
      null,
    );


  const [aiLoading, setAiLoading] =
    useState(false);


  const [aiError, setAiError] =
    useState<string | null>(null);


  const [error, setError] =
    useState<string | null>(null);


  /*
   * ==========================================
   * ENGINE
   * ==========================================
   */

  useEffect(() => {
    const engine =
      new PresentationEngine({
        onDiagnostics:
          (nextDiagnostics) => {
            setDiagnostics(
              nextDiagnostics,
            );
          },

      });


    engineRef.current =
      engine;


    return () => {
      engine.dispose();

      engineRef.current =
        null;
    };
  }, []);


  /*
   * ==========================================
   * START
   * ==========================================
   */

  async function handleStart() {
    const engine =
      engineRef.current;

    const video =
      videoRef.current;


    if (!engine || !video) {
      return;
    }


    try {
      setError(null);


      /*
       * New attempt = remove
       * previous final report.
       */

      setSessionResult(
        null,
      );

      setSessionReport(
        null,
      );

      setAiPayload(
        null,
      );

      setAiAnalysis(
        null,
      );

      setAiError(
        null,
      );

      setAiLoading(
        false,
      );


      await engine.start(
        video,
      );
    } catch (
      caughtError
    ) {
      console.error(
        caughtError,
      );


      setError(
        caughtError instanceof Error
          ? caughtError.message
          : "Failed to start presentation engine.",
      );
    }
  }


  /*
   * ==========================================
   * STOP
   * ==========================================
   */

  async function handleStop() {
    const engine =
      engineRef.current;


    if (!engine) {
      return;
    }


    /*
     * stop() finalizes:
     *
     * SessionAggregator
     *       ↓
     * PresentationScorer
     *       ↓
     * SessionReportSerializer
     */

    const finalDiagnostics =
      engine.stop();


    const finalResult =
      engine.getSessionResult();


    const finalReport =
      engine.getSessionReport();


    const finalAiPayload =
      engine.getAiPayload();


    setDiagnostics(
      finalDiagnostics,
    );


    setSessionResult(
      finalResult,
    );


    setSessionReport(
      finalReport,
    );


    setAiPayload(
      finalAiPayload,
    );


    setAiAnalysis(
      null,
    );


    setAiError(
      null,
    );


    /*
     * Send only the deterministic AI payload
     * to the server-side Gemini route.
     *
     * The browser never receives or uses
     * the Gemini API key.
     */

    if (!finalAiPayload) {
      return;
    }


    if (!finalResult) {
      setAiError(
        "No final presentation result was produced.",
      );

      return;
    }


    if (!finalResult.reliable) {
      setAiError(
        "Session is not reliable enough for AI analysis.",
      );

      return;
    }


    setAiLoading(
      true,
    );


    try {
      const response =
        await fetch(
          "/api/presentation/analyze",
          {
            method:
              "POST",

            headers: {
              "Content-Type":
                "application/json",
            },

            body:
              JSON.stringify(
                finalAiPayload,
              ),
          },
        );


      const data:
        unknown =
        await response.json();


      if (!response.ok) {
        const message =
          typeof data === "object" &&
          data !== null &&
          "error" in data &&
          typeof (
            data as {
              error?: unknown;
            }
          ).error === "string"
            ? (
                data as {
                  error: string;
                }
              ).error
            : "Gemini analysis failed.";

        throw new Error(
          message,
        );
      }


      const analysis =
        typeof data === "object" &&
        data !== null &&
        "analysis" in data
          ? (
              data as {
                analysis?: unknown;
              }
            ).analysis
          : null;


      if (
        typeof analysis !==
        "object" ||
        analysis === null
      ) {
        throw new Error(
          "Gemini returned an invalid analysis response.",
        );
      }


      setAiAnalysis(
        analysis as PresentationAiResponse,
      );
    } catch (
      caughtError
    ) {
      console.error(
        "Gemini presentation analysis failed:",
        caughtError,
      );


      setAiError(
        caughtError instanceof Error
          ? caughtError.message
          : "Gemini presentation analysis failed.",
      );
    } finally {
      setAiLoading(
        false,
      );
    }
  }



  /*
   * ==========================================
   * VALUES
   * ==========================================
   */

  const camera =
    diagnostics.camera;

  const headPose =
    diagnostics.headPose;

  const calibration =
    diagnostics.calibration;

  const calibratedHead =
    calibration.calibratedHead;

  const headMovement =
    diagnostics.headMovement;

  const faceVisibility =
    diagnostics.faceVisibility;

  const blink =
    diagnostics.blink;

  const upperBody =
    diagnostics.upperBody;

  const running =
    diagnostics.status ===
    "running";


  /*
   * ==========================================
   * UI
   * ==========================================
   */

  return (
    <main className="min-h-screen bg-black px-6 py-8 text-white">
      <div className="mx-auto max-w-7xl">

        <header className="mb-10">
          <h1 className="text-3xl font-semibold">
            YOC.ai Presentation Engine
          </h1>

          <p className="mt-1 text-sm text-neutral-400">
            Camera presentation analysis and scoring
          </p>
        </header>


        <div className="grid gap-8 lg:grid-cols-2">

          {/* ================= CAMERA ================= */}

          <section>
            <div className="relative aspect-video overflow-hidden rounded-xl border border-neutral-800 bg-neutral-900">

              <video
                ref={videoRef}
                autoPlay
                playsInline
                muted
                className="absolute inset-0 h-full w-full object-cover"
              />


              {running && (
                <div className="absolute left-4 top-4 rounded-full border border-emerald-500/30 bg-black/70 px-3 py-1.5 text-xs font-medium text-emerald-300 backdrop-blur">
                  ANALYZING
                </div>
              )}

            </div>


            <div className="mt-5 flex gap-3">

              <button
                type="button"
                onClick={
                  handleStart
                }
                disabled={
                  running
                }
                className="rounded-lg bg-white px-5 py-3 text-sm font-medium text-black disabled:cursor-not-allowed disabled:opacity-40"
              >
                Start Engine
              </button>


              <button
                type="button"
                onClick={
                  handleStop
                }
                disabled={
                  !running
                }
                className="rounded-lg border border-neutral-700 px-5 py-3 text-sm font-medium disabled:cursor-not-allowed disabled:opacity-40"
              >
                Stop Engine
              </button>

            </div>


            {error && (
              <div className="mt-5 rounded-lg border border-red-900 bg-red-950/40 p-4 text-sm text-red-300">
                {error}
              </div>
            )}


            {running && (
              <div className="mt-5 rounded-xl border border-neutral-800 bg-neutral-950 p-5">
                <div className="text-sm font-medium">
                  Session running
                </div>

                <p className="mt-2 text-sm leading-6 text-neutral-400">
                  Stay naturally positioned and speak as you would in an
                  interview. Initial head calibration completes automatically.
                </p>
              </div>
            )}

          </section>


          {/* ================= DIAGNOSTICS ================= */}

          <section className="rounded-xl border border-neutral-800 bg-neutral-950 p-7">

            <h2 className="mb-4 text-xl font-semibold">
              Diagnostics
            </h2>


            <DiagnosticRow
              label="Status"
              value={
                diagnostics.status
              }
            />


            <DiagnosticRow
              label="Resolution"
              value={
                camera
                  ? `${camera.width} × ${camera.height}`
                  : "—"
              }
            />


            <DiagnosticRow
              label="Camera FPS"
              value={
                running
                  ? "Active"
                  : "—"
              }
            />


            {/* ================= FACE ================= */}

            <SectionLabel>
              FACE
            </SectionLabel>


            <DiagnosticRow
              label="Face Model"
              value={
                diagnostics.face.modelReady
                  ? "Ready"
                  : "Not Ready"
              }
            />


            <DiagnosticRow
              label="Face Detected"
              value={
                diagnostics.face.detected
                  ? "YES"
                  : "NO"
              }
            />


            <DiagnosticRow
              label="Face Target"
              value={`${diagnostics.face.targetFps} FPS`}
            />


            <DiagnosticRow
              label="Face FPS"
              value={
                diagnostics.face.actualFps.toFixed(
                  1,
                )
              }
            />


            <DiagnosticRow
              label="Face Latency"
              value={`${diagnostics.face.latencyMs.toFixed(1)} ms`}
            />


            <DiagnosticRow
              label="Face Avg Latency"
              value={`${diagnostics.face.averageLatencyMs.toFixed(1)} ms`}
            />


            <DiagnosticRow
              label="Face Frames"
              value={
                diagnostics.face.processedFrames
              }
            />


            {/* ================= HEAD ================= */}

            <SectionLabel>
              HEAD ORIENTATION
            </SectionLabel>


            <DiagnosticRow
              label="Yaw"
              value={
                headPose
                  ? `${headPose.yaw.toFixed(1)}°`
                  : "—"
              }
            />


            <DiagnosticRow
              label="Pitch"
              value={
                headPose
                  ? `${headPose.pitch.toFixed(1)}°`
                  : "—"
              }
            />


            <DiagnosticRow
              label="Roll"
              value={
                headPose
                  ? `${headPose.roll.toFixed(1)}°`
                  : "—"
              }
            />


            {/* ================= CALIBRATION ================= */}

            <SectionLabel>
              HEAD CALIBRATION
            </SectionLabel>


            <DiagnosticRow
              label="Status"
              value={
                calibration.status.toUpperCase()
              }
            />


            <DiagnosticRow
              label="Samples"
              value={`${calibration.sampleCount} / ${calibration.targetSamples}`}
            />


            <DiagnosticRow
              label="Progress"
              value={`${Math.round(calibration.progress * 100)}%`}
            />


            <DiagnosticRow
              label="Baseline Yaw"
              value={
                calibration.baseline
                  ? `${calibration.baseline.yaw.toFixed(1)}°`
                  : "—"
              }
            />


            <DiagnosticRow
              label="Baseline Pitch"
              value={
                calibration.baseline
                  ? `${calibration.baseline.pitch.toFixed(1)}°`
                  : "—"
              }
            />


            <DiagnosticRow
              label="Baseline Roll"
              value={
                calibration.baseline
                  ? `${calibration.baseline.roll.toFixed(1)}°`
                  : "—"
              }
            />


            <DiagnosticRow
              label="Deviation Yaw"
              value={
                calibratedHead
                  ? `${calibratedHead.yaw.toFixed(1)}°`
                  : "—"
              }
            />


            <DiagnosticRow
              label="Deviation Pitch"
              value={
                calibratedHead
                  ? `${calibratedHead.pitch.toFixed(1)}°`
                  : "—"
              }
            />


            <DiagnosticRow
              label="Deviation Roll"
              value={
                calibratedHead
                  ? `${calibratedHead.roll.toFixed(1)}°`
                  : "—"
              }
            />


            {/* ================= HEAD MOVEMENT ================= */}

            <SectionLabel>
              HEAD MOVEMENT
            </SectionLabel>


            <DiagnosticRow
              label="Direction"
              value={
                headMovement
                  ? headMovement.direction.toUpperCase()
                  : "—"
              }
            />


            <DiagnosticRow
              label="Centered"
              value={
                headMovement
                  ? (
                      headMovement.centered
                        ? "YES"
                        : "NO"
                    )
                  : "—"
              }
            />


            <DiagnosticRow
              label="Looking Away"
              value={
                headMovement
                  ? (
                      headMovement.lookingAway
                        ? "YES"
                        : "NO"
                    )
                  : "—"
              }
            />


            <DiagnosticRow
              label="Movement Level"
              value={
                headMovement
                  ? headMovement.movementLevel.toUpperCase()
                  : "—"
              }
            />


            <DiagnosticRow
              label="Stability"
              value={
                headMovement
                  ? `${headMovement.stabilityScore.toFixed(1)}%`
                  : "—"
              }
            />


            <DiagnosticRow
              label="Centered Time"
              value={
                headMovement
                  ? `${headMovement.centeredPercent.toFixed(1)}%`
                  : "—"
              }
            />


            <DiagnosticRow
              label="Looking Away Time"
              value={
                headMovement
                  ? `${headMovement.lookingAwayPercent.toFixed(1)}%`
                  : "—"
              }
            />


            <DiagnosticRow
              label="Movement Samples"
              value={
                headMovement
                  ? headMovement.sampleCount
                  : "—"
              }
            />


            {/* ================= VISIBILITY ================= */}

            <SectionLabel>
              FACE VISIBILITY
            </SectionLabel>


            <DiagnosticRow
              label="Visible"
              value={
                faceVisibility
                  ? (
                      faceVisibility.visible
                        ? "YES"
                        : "NO"
                    )
                  : "—"
              }
            />


            <DiagnosticRow
              label="Visibility"
              value={
                faceVisibility
                  ? `${faceVisibility.visibilityPercent.toFixed(1)}%`
                  : "—"
              }
            />


            <DiagnosticRow
              label="Framing"
              value={
                faceVisibility
                  ? faceVisibility.framing.toUpperCase()
                  : "—"
              }
            />


            <DiagnosticRow
              label="Centered"
              value={
                faceVisibility
                  ? (
                      faceVisibility.centered
                        ? "YES"
                        : "NO"
                    )
                  : "—"
              }
            />


            <DiagnosticRow
              label="Face Width"
              value={
                faceVisibility
                  ? `${(faceVisibility.faceWidthRatio * 100).toFixed(1)}%`
                  : "—"
              }
            />


            <DiagnosticRow
              label="Face Height"
              value={
                faceVisibility
                  ? `${(faceVisibility.faceHeightRatio * 100).toFixed(1)}%`
                  : "—"
              }
            />


            <DiagnosticRow
              label="Visibility Samples"
              value={
                faceVisibility
                  ? `${faceVisibility.visibleSamples} / ${faceVisibility.sampleCount}`
                  : "—"
              }
            />


            {/* ================= EYE TELEMETRY ================= */}

            <SectionLabel>
              EYE TELEMETRY
            </SectionLabel>

            <DiagnosticRow
              label="Eyes Closed"
              value={
                blink
                  ? blink.eyesClosed
                    ? "YES"
                    : "NO"
                  : "—"
              }
            />

            <DiagnosticRow
              label="Left Eye Openness"
              value={
                blink
                  ? blink.leftEyeOpenness.toFixed(3)
                  : "—"
              }
            />

            <DiagnosticRow
              label="Right Eye Openness"
              value={
                blink
                  ? blink.rightEyeOpenness.toFixed(3)
                  : "—"
              }
            />

            <DiagnosticRow
              label="Average Eye Openness"
              value={
                blink
                  ? blink.averageEyeOpenness.toFixed(3)
                  : "—"
              }
            />

            {/* ================= POSE ================= */}

            <SectionLabel>
              POSE
            </SectionLabel>


            <DiagnosticRow
              label="Pose Model"
              value={
                diagnostics.pose.modelReady
                  ? "Ready"
                  : "Not Ready"
              }
            />


            <DiagnosticRow
              label="Pose Detected"
              value={
                diagnostics.pose.detected
                  ? "YES"
                  : "NO"
              }
            />


            <DiagnosticRow
              label="Pose Target"
              value={`${diagnostics.pose.targetFps} FPS`}
            />


            <DiagnosticRow
              label="Pose FPS"
              value={
                diagnostics.pose.actualFps.toFixed(
                  1,
                )
              }
            />


            <DiagnosticRow
              label="Pose Latency"
              value={`${diagnostics.pose.latencyMs.toFixed(1)} ms`}
            />


            <DiagnosticRow
              label="Pose Avg Latency"
              value={`${diagnostics.pose.averageLatencyMs.toFixed(1)} ms`}
            />


            <DiagnosticRow
              label="Pose Frames"
              value={
                diagnostics.pose.processedFrames
              }
            />


            <SectionLabel>
              UPPER BODY
            </SectionLabel>


            <DiagnosticRow
              label="Posture"
              value={
                upperBody
                  ? upperBody.posture.toUpperCase()
                  : "—"
              }
            />


            <DiagnosticRow
              label="Shoulders Visible"
              value={
                upperBody
                  ? (
                      upperBody.shouldersVisible
                        ? "YES"
                        : "NO"
                    )
                  : "—"
              }
            />


            <DiagnosticRow
              label="Shoulder Tilt"
              value={
                upperBody
                  ? `${upperBody.shoulderTiltDegrees.toFixed(2)}°`
                  : "—"
              }
            />


            <DiagnosticRow
              label="Torso Lean"
              value={
                upperBody
                  ? upperBody.torsoLean.toFixed(4)
                  : "—"
              }
            />


            <DiagnosticRow
              label="Centered"
              value={
                upperBody
                  ? (
                      upperBody.centered
                        ? "YES"
                        : "NO"
                    )
                  : "—"
              }
            />


            <DiagnosticRow
              label="Stability"
              value={
                upperBody
                  ? `${upperBody.stabilityScore.toFixed(1)}%`
                  : "—"
              }
            />


            <DiagnosticRow
              label="Good Posture"
              value={
                upperBody
                  ? `${upperBody.goodPosturePercent.toFixed(1)}%`
                  : "—"
              }
            />


            <DiagnosticRow
              label="Samples"
              value={
                upperBody
                  ? upperBody.sampleCount
                  : "—"
              }
            />

          </section>

        </div>


        {/* ==========================================
            FINAL SESSION RESULT
        ========================================== */}

        {sessionResult && (
          <section className="mt-8 rounded-2xl border border-neutral-800 bg-neutral-950 p-7 md:p-9">

            <div className="flex flex-col gap-6 border-b border-neutral-800 pb-8 md:flex-row md:items-end md:justify-between">

              <div>
                <div className="text-xs font-semibold tracking-[0.25em] text-neutral-500">
                  FINAL ANALYSIS
                </div>


                <h2 className="mt-3 text-2xl font-semibold">
                  Presentation Score
                </h2>


                <p className="mt-2 max-w-2xl text-sm leading-6 text-neutral-400">
                  Session-level analysis calculated from the complete camera
                  session, rather than a single frame.
                </p>
              </div>


              <div className="flex items-end gap-3">
                <span className="text-6xl font-semibold tracking-tight">
                  {sessionResult.overallScore}
                </span>

                <span className="pb-2 text-neutral-500">
                  / 100
                </span>
              </div>

            </div>


            {/* SCORE OVERVIEW */}

            <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">

              <ResultMetric
                label="Score / 10"
                value={`${sessionResult.scoreOutOf10} / 10`}
              />


              <ResultMetric
                label="Reliability"
                value={
                  sessionResult.reliable
                    ? "Reliable"
                    : "Limited"
                }
              />


              <ResultMetric
                label="Duration"
                value={
                  formatDuration(
                    sessionResult.summary.durationMs,
                  )
                }
              />


              <ResultMetric
                label="Samples"
                value={`${sessionResult.summary.faceSamples} face`}
              />

            </div>


            {!sessionResult.reliable &&
              sessionResult.reliabilityReason && (
                <div className="mt-5 rounded-xl border border-amber-800/60 bg-amber-950/20 p-4 text-sm text-amber-200">
                  {
                    sessionResult.reliabilityReason
                  }
                </div>
              )}


            {/* CATEGORY SCORES */}

            <div className="mt-10">

              <SectionLabel>
                CATEGORY SCORES
              </SectionLabel>


              <div className="mt-3 grid gap-4 md:grid-cols-2 xl:grid-cols-4">

                <ScoreCard
                  label="Camera Engagement"
                  value={
                    sessionResult.categories.cameraEngagement
                  }
                />


                <ScoreCard
                  label="Posture"
                  value={
                    sessionResult.categories.posture
                  }
                />


                <ScoreCard
                  label="Facial Expressiveness"
                  value={
                    sessionResult.categories.facialExpressiveness
                  }
                />


                <ScoreCard
                  label="Head Stability"
                  value={
                    sessionResult.categories.headStability
                  }
                />


                <ScoreCard
                  label="Framing"
                  value={
                    sessionResult.categories.framing
                  }
                />


                <ScoreCard
                  label="Visual Quality"
                  value={
                    sessionResult.categories.visualQuality
                  }
                />


                <ScoreCard
                  label="Presence Stability"
                  value={
                    sessionResult.categories.presenceStability
                  }
                />

              </div>
            </div>


            {/* STRENGTHS + IMPROVEMENTS */}

            <div className="mt-10 grid gap-6 lg:grid-cols-2">

              <FeedbackPanel
                title="Strengths"
                items={
                  sessionResult.strengths
                }
              />


              <FeedbackPanel
                title="Improvements"
                items={
                  sessionResult.improvements
                }
              />

            </div>


            {/* SESSION METRICS */}

            <div className="mt-10">

              <SectionLabel>
                SESSION SUMMARY
              </SectionLabel>


              <div className="mt-3 grid gap-x-10 lg:grid-cols-2">

                <div>

                  <DiagnosticRow
                    label="Face Visibility"
                    value={`${sessionResult.summary.faceVisibilityPercent.toFixed(1)}%`}
                  />


                  <DiagnosticRow
                    label="Good Framing"
                    value={`${sessionResult.summary.goodFramingPercent.toFixed(1)}%`}
                  />


                  <DiagnosticRow
                    label="Face Centered"
                    value={`${sessionResult.summary.centeredFacePercent.toFixed(1)}%`}
                  />


                  <DiagnosticRow
                    label="Head Centered"
                    value={`${sessionResult.summary.headCenteredPercent.toFixed(1)}%`}
                  />


                  <DiagnosticRow
                    label="Looking Away"
                    value={`${sessionResult.summary.lookingAwayPercent.toFixed(1)}%`}
                  />


                  <DiagnosticRow
                    label="Head Stability"
                    value={`${sessionResult.summary.headStabilityScore.toFixed(1)}%`}
                  />

                </div>


                <div>

                  <DiagnosticRow
                    label="Good Posture"
                    value={`${sessionResult.summary.goodPosturePercent.toFixed(1)}%`}
                  />


                  <DiagnosticRow
                    label="Body Centered"
                    value={`${sessionResult.summary.bodyCenteredPercent.toFixed(1)}%`}
                  />


                  <DiagnosticRow
                    label="Body Stability"
                    value={`${sessionResult.summary.bodyStabilityScore.toFixed(1)}%`}
                  />


                  <DiagnosticRow
                    label="Pose Samples"
                    value={
                      sessionResult.summary.poseSamples
                    }
                  />

                </div>

              </div>
            </div>


            {/* SAMPLE COUNTS */}

            <div className="mt-8 rounded-xl border border-neutral-800 bg-black/40 p-5">

              <div className="text-xs font-semibold tracking-[0.2em] text-neutral-500">
                ANALYSIS SAMPLE COUNTS
              </div>


              <div className="mt-4 grid gap-4 sm:grid-cols-3">

                <ResultMetric
                  label="Face"
                  value={
                    sessionResult.summary.faceSamples
                  }
                />


                <ResultMetric
                  label="Head"
                  value={
                    sessionResult.summary.headSamples
                  }
                />


                <ResultMetric
                  label="Pose"
                  value={
                    sessionResult.summary.poseSamples
                  }
                />

              </div>

            </div>

          </section>
        )}


        {/* ==========================================
            SESSION JSON
        ========================================== */}

        {sessionReport && (
          <section className="mt-8 rounded-2xl border border-neutral-800 bg-neutral-950 p-7 md:p-9">
            <div className="border-b border-neutral-800 pb-6">
              <div className="text-xs font-semibold tracking-[0.25em] text-neutral-500">
                SESSION JSON
              </div>

              <h2 className="mt-3 text-2xl font-semibold">
                Structured Session Report
              </h2>

              <p className="mt-2 max-w-2xl text-sm leading-6 text-neutral-400">
                Complete structured output containing the finalized scores,
                evidence, reliability, sample counts, strengths, and improvements.
              </p>
            </div>

            <pre className="mt-6 max-h-[520px] overflow-auto rounded-xl border border-neutral-800 bg-black p-5 text-xs leading-6 text-neutral-300">
              {JSON.stringify(
                sessionReport,
                null,
                2,
              )}
            </pre>
          </section>
        )}


        {/* ==========================================
            GEMINI AI ANALYSIS
        ========================================== */}

        {sessionReport && (
          <section className="mt-8 rounded-2xl border border-neutral-800 bg-neutral-950 p-7 md:p-9">
            <div className="flex flex-col gap-4 border-b border-neutral-800 pb-6 md:flex-row md:items-end md:justify-between">
              <div>
                <div className="text-xs font-semibold tracking-[0.25em] text-neutral-500">
                  GEMINI AI ANALYSIS
                </div>

                <h2 className="mt-3 text-2xl font-semibold">
                  Interview Presentation Coach
                </h2>

                <p className="mt-2 max-w-2xl text-sm leading-6 text-neutral-400">
                  AI-generated coaching based on the finalized presentation
                  session data.
                </p>
              </div>

              <div className="rounded-full border border-neutral-800 px-4 py-2 text-xs text-neutral-400">
                Gemini Flash
              </div>
            </div>


            {aiLoading && (
              <div className="mt-6 rounded-xl border border-neutral-800 bg-black/40 p-6">
                <div className="text-sm font-medium">
                  Analyzing presentation...
                </div>

                <p className="mt-2 text-sm text-neutral-500">
                  Gemini is generating personalized coaching from your
                  completed session.
                </p>
              </div>
            )}


            {aiError && (
              <div className="mt-6 rounded-xl border border-red-900 bg-red-950/30 p-5">
                <div className="text-sm font-medium text-red-300">
                  AI analysis unavailable
                </div>

                <p className="mt-2 text-sm leading-6 text-red-200/80">
                  {aiError}
                </p>
              </div>
            )}


            {aiAnalysis && (
              <div className="mt-8 space-y-6">
                <div className="rounded-xl border border-neutral-800 bg-black/40 p-6">
                  <div className="text-xs font-semibold tracking-[0.2em] text-neutral-500">
                    SUMMARY
                  </div>

                  <p className="mt-4 text-sm leading-7 text-neutral-300">
                    {aiAnalysis.summary}
                  </p>
                </div>


                <div className="grid gap-6 lg:grid-cols-2">
                  <FeedbackPanel
                    title="AI Strengths"
                    items={
                      aiAnalysis.strengths
                    }
                  />

                  <FeedbackPanel
                    title="AI Improvements"
                    items={
                      aiAnalysis.improvements
                    }
                  />
                </div>


                <FeedbackPanel
                  title="Coaching"
                  items={
                    aiAnalysis.coaching
                  }
                />


                <div className="rounded-xl border border-neutral-800 bg-black/40 p-6">
                  <div className="text-xs font-semibold tracking-[0.2em] text-neutral-500">
                    PRIORITY
                  </div>

                  <div className="mt-3 text-xl font-semibold">
                    {aiAnalysis.priority
                      .replaceAll(
                        "_",
                        " ",
                      )
                      .replace(
                        /^./,
                        (character: string) =>
                          character.toUpperCase(),
                      )}
                  </div>
                </div>
              </div>
            )}
          </section>
        )}


        {/* ==========================================
            AI PAYLOAD
        ========================================== */}

        {aiPayload && (
          <section className="mt-8 rounded-2xl border border-neutral-800 bg-neutral-950 p-7 md:p-9">
            <div className="border-b border-neutral-800 pb-6">
              <div className="text-xs font-semibold tracking-[0.25em] text-neutral-500">
                AI PAYLOAD
              </div>

              <h2 className="mt-3 text-2xl font-semibold">
                Lightweight AI Analysis Input
              </h2>

              <p className="mt-2 max-w-2xl text-sm leading-6 text-neutral-400">
                Compact JSON prepared for the future AI feedback layer.
                Blink count/rate and hip data are not included.
              </p>
            </div>

            <pre className="mt-6 max-h-[520px] overflow-auto rounded-xl border border-neutral-800 bg-black p-5 text-xs leading-6 text-neutral-300">
              {JSON.stringify(
                aiPayload,
                null,
                2,
              )}
            </pre>
          </section>
        )}

      </div>
    </main>
  );
}


/*
 * ==========================================
 * SCORE CARD
 * ==========================================
 */

function ScoreCard({
  label,
  value,
}: {
  label: string;
  value: number;
}) {
  return (
    <div className="rounded-xl border border-neutral-800 bg-black/40 p-5">

      <div className="text-xs font-medium uppercase tracking-wider text-neutral-500">
        {label}
      </div>


      <div className="mt-3 flex items-end gap-1">
        <span className="text-3xl font-semibold">
          {value}
        </span>

        <span className="pb-1 text-sm text-neutral-600">
          /100
        </span>
      </div>


      <div className="mt-4 h-1.5 overflow-hidden rounded-full bg-neutral-800">

        <div
          className="h-full rounded-full bg-white transition-all"
          style={{
            width: `${Math.min(
              Math.max(
                value,
                0,
              ),
              100,
            )}%`,
          }}
        />

      </div>

    </div>
  );
}


/*
 * ==========================================
 * RESULT METRIC
 * ==========================================
 */

function ResultMetric({
  label,
  value,
}: {
  label: string;
  value: string | number;
}) {
  return (
    <div className="rounded-xl border border-neutral-800 bg-black/40 p-4">

      <div className="text-xs text-neutral-500">
        {label}
      </div>


      <div className="mt-2 font-mono text-lg font-semibold">
        {value}
      </div>

    </div>
  );
}


/*
 * ==========================================
 * FEEDBACK PANEL
 * ==========================================
 */

function FeedbackPanel({
  title,
  items,
}: {
  title: string;
  items: string[];
}) {
  return (
    <div className="rounded-xl border border-neutral-800 bg-black/40 p-6">

      <h3 className="font-semibold">
        {title}
      </h3>


      <div className="mt-5 space-y-4">

        {items.map(
          (
            item,
            index,
          ) => (
            <div
              key={`${title}-${index}`}
              className="flex gap-3 text-sm leading-6 text-neutral-300"
            >

              <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-neutral-500" />

              <span>
                {item}
              </span>

            </div>
          ),
        )}

      </div>

    </div>
  );
}


/*
 * ==========================================
 * DIAGNOSTIC ROW
 * ==========================================
 */

function DiagnosticRow({
  label,
  value,
}: {
  label: string;
  value: string | number;
}) {
  return (
    <div className="flex items-center justify-between gap-6 border-b border-neutral-800 py-3">

      <span className="text-sm text-neutral-400">
        {label}
      </span>


      <span className="text-right font-mono text-sm font-semibold text-white">
        {value}
      </span>

    </div>
  );
}


/*
 * ==========================================
 * SECTION LABEL
 * ==========================================
 */

function SectionLabel({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="pb-2 pt-8 text-xs font-semibold tracking-[0.25em] text-neutral-500">
      {children}
    </div>
  );
}


/*
 * ==========================================
 * DURATION
 * ==========================================
 */

function formatDuration(
  durationMs: number,
): string {
  const totalSeconds =
    Math.max(
      0,
      Math.round(
        durationMs / 1000,
      ),
    );


  const minutes =
    Math.floor(
      totalSeconds / 60,
    );


  const seconds =
    totalSeconds % 60;


  if (minutes === 0) {
    return `${seconds}s`;
  }


  return `${minutes}m ${seconds}s`;
}