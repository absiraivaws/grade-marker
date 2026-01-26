import React, { useRef, useState, useCallback, useEffect } from 'react';
import { Camera, X, Check, RefreshCw, CheckCircle } from 'lucide-react';

interface WebcamScannerProps {
  onCapture: (imageData: string) => void;
  onClose: () => void;
  isActive: boolean;
  // New props for Identify-Confirm flow
  isProcessing?: boolean;
  scanResult?: { studentName: string | null, confidence: string } | null;
  onScanConfirm?: () => void;
  onScanCancel?: () => void; // Clears result/processing
}

export const WebcamScanner: React.FC<WebcamScannerProps> = ({
  onCapture,
  onClose,
  isActive,
  isProcessing,
  scanResult,
  onScanConfirm,
  onScanCancel
}) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  // Use ref to track stream so we don't restart effect when stream state changes
  const streamRef = useRef<MediaStream | null>(null);
  const [capturedImage, setCapturedImage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [debugLog, setDebugLog] = useState<string>('');

  // Camera Selection State
  const [devices, setDevices] = useState<MediaDeviceInfo[]>([]);
  const [selectedDeviceId, setSelectedDeviceId] = useState<string>('');

  const log = (msg: string) => setDebugLog(prev => prev + '\n' + msg);

  const [autoCaptureEnabled, setAutoCaptureEnabled] = useState(true);
  const [stabilityProgress, setStabilityProgress] = useState(0); // 0 to 100

  const lastFrameDataRef = useRef<Uint8ClampedArray | null>(null);
  const stabilityCountRef = useRef(0);
  const checkIntervalRef = useRef<NodeJS.Timeout | null>(null);

  const [statusMessage, setStatusMessage] = useState<string>('Align paper...');
  const webcamMountedTimeRef = useRef<number>(Date.now());

  // Motion Detection Constants
  const MOTION_THRESHOLD = 25; // Lower = more sensitive to movement (stricter stability)
  const PIXEL_SKIP = 8;
  const STABILITY_REQUIRED = 10; // 10 * 200ms = 2.0 seconds stable
  const CHECK_MS = 200;
  const WARMUP_DELAY = 2000; // 2 seconds before engaging

  // Auto-Capture Loop
  useEffect(() => {
    // Reset timer on mount/reset
    webcamMountedTimeRef.current = Date.now();
  }, [isActive, autoCaptureEnabled]);

  useEffect(() => {
    if (!isActive || !autoCaptureEnabled || capturedImage || isProcessing || scanResult) {
      if (checkIntervalRef.current) clearInterval(checkIntervalRef.current);
      setStabilityProgress(0);
      stabilityCountRef.current = 0;
      setStatusMessage('');
      return;
    }

    const checkStability = () => {
      // 1. Warmup Check
      if (Date.now() - webcamMountedTimeRef.current < WARMUP_DELAY) {
        setStatusMessage('Getting camera ready...');
        return;
      }

      if (!videoRef.current || !canvasRef.current) return;
      const video = videoRef.current;
      const canvas = canvasRef.current;
      const ctx = canvas.getContext('2d');

      if (!ctx || video.readyState !== 4) return;

      // Analysis Resolution
      const w = 64;
      const h = 48;
      canvas.width = w;
      canvas.height = h;
      ctx.drawImage(video, 0, 0, w, h);

      const frameData = ctx.getImageData(0, 0, w, h).data;

      // --- DOCUMENT HEURISTIC CHECK ---
      let paperPixelCount = 0;
      let skinPixelCount = 0;
      let textEdgeCount = 0;
      const totalPixels = w * h;

      for (let i = 0; i < frameData.length; i += 4) {
        const r = frameData[i];
        const g = frameData[i + 1];
        const b = frameData[i + 2];
        const avg = (r + g + b) / 3;

        // 1. Paper Detection: MUST be Bright AND Low Saturation (Achromatic)
        // High brightness independently is not enough (could be a light source)
        // Low saturation independently is not enough (could be a dark grey shadow)
        const max = Math.max(r, g, b);
        const min = Math.min(r, g, b);
        const sat = max - min;

        // Paper = Bright (>110) AND Low Saturation (<40)
        // Relaxed brightness slightly to 110 to catch paper in normal room light, but strict saturation
        if (avg > 110 && sat < 40) {
          paperPixelCount++;
        }

        // 2. Skin Detection (Simple Rule-based)
        // R > 95, G > 40, B > 20, Max-Min > 15, |R-G| > 15, R > G, R > B
        if (r > 95 && g > 40 && b > 20 && sat > 15 && Math.abs(r - g) > 15 && r > g && r > b) {
          skinPixelCount++;
        }

        // 3. Text/Edge Detection
        if (i > 4) {
          const prevAvg = (frameData[i - 4] + frameData[i - 3] + frameData[i - 2]) / 3;
          // Contrast adjacent pixels
          if (Math.abs(avg - prevAvg) > 20) textEdgeCount++;
        }
      }

      const paperRatio = paperPixelCount / totalPixels;
      const skinRatio = skinPixelCount / totalPixels;
      const contentRatio = textEdgeCount / totalPixels;

      // DEBUG: console.log(`Paper: ${paperRatio.toFixed(2)}, Skin: ${skinRatio.toFixed(2)}, Content: ${contentRatio.toFixed(2)}`);

      // Heuristic Rules
      if (skinRatio > 0.15) {
        setStatusMessage('Face/Hand Detected - Blocking');
        stabilityCountRef.current = 0;
        setStabilityProgress(0);
        return;
      }
      if (paperRatio < 0.40) {
        setStatusMessage('Align White Paper to Camera'); // Not enough paper-like pixels
        stabilityCountRef.current = 0;
        setStabilityProgress(0);
        return;
      }
      if (contentRatio < 0.02) {
        setStatusMessage('Focusing...'); // Looks like paper but no text (blurry?)
        stabilityCountRef.current = 0;
        setStabilityProgress(0);
        return;
      }
      // --------------------------------

      if (lastFrameDataRef.current) {
        let diffScore = 0;
        const len = frameData.length;
        let pixelsChecked = 0;

        for (let i = 0; i < len; i += PIXEL_SKIP * 4) {
          const diff = Math.abs(frameData[i] - lastFrameDataRef.current[i]) +
            Math.abs(frameData[i + 1] - lastFrameDataRef.current[i + 1]) +
            Math.abs(frameData[i + 2] - lastFrameDataRef.current[i + 2]);
          diffScore += diff;
          pixelsChecked++;
        }

        const avgDiff = diffScore / pixelsChecked;

        // Stable?
        if (avgDiff < MOTION_THRESHOLD) {
          stabilityCountRef.current += 1;
          const progress = Math.min((stabilityCountRef.current / STABILITY_REQUIRED) * 100, 100);
          setStabilityProgress(progress);
          setStatusMessage('Hold Still...');

          if (stabilityCountRef.current >= STABILITY_REQUIRED) {
            handleCapture();
            stabilityCountRef.current = 0;
            setStabilityProgress(0);
            if (navigator.vibrate) navigator.vibrate(200);
          }
        } else {
          stabilityCountRef.current = 0;
          setStabilityProgress(0);
          setStatusMessage('Stabilizing...');
        }
      } else {
        setStatusMessage('Initializing...');
      }

      lastFrameDataRef.current = frameData;
    };

    checkIntervalRef.current = setInterval(checkStability, CHECK_MS);

    return () => {
      if (checkIntervalRef.current) clearInterval(checkIntervalRef.current);
    };
  }, [isActive, autoCaptureEnabled, capturedImage, isProcessing, scanResult]);

  // Reset stability when dependencies change roughly
  useEffect(() => {
    stabilityCountRef.current = 0;
    setStabilityProgress(0);
  }, [selectedDeviceId]);


  // 1. Fetch available cameras on mount (existing)
  useEffect(() => {
    const fetchDevices = async () => {
      try {
        const devs = await navigator.mediaDevices.enumerateDevices();
        const videoDevs = devs.filter(d => d.kind === 'videoinput');
        setDevices(videoDevs);
        log(`Found ${videoDevs.length} cameras`);
        if (videoDevs.length > 0) {
          // Default to first one if none selected, or let getUserMedia pick default first
          // We won't auto-set selectedDeviceId yet to allow default 'Any' behavior initially
        }
      } catch (err) {
        log('Error identifying cameras: ' + err);
      }
    };
    fetchDevices();
  }, []);

  const startCamera = useCallback(async (deviceId?: string) => {
    // Stop existing stream if any (force restart for switch)
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop());
      streamRef.current = null;
    }

    try {
      log(`Requesting camera... ${deviceId ? '(Device: ' + deviceId + ')' : '(Default)'}`);

      const constraints: MediaStreamConstraints = {
        video: deviceId ? { deviceId: { exact: deviceId } } : true
      };

      const mediaStream = await navigator.mediaDevices.getUserMedia(constraints);
      log(`Stream acquired: ${mediaStream.id}`);

      streamRef.current = mediaStream;

      if (videoRef.current) {
        log('Attaching stream to video element');
        videoRef.current.srcObject = mediaStream;
        try {
          await videoRef.current.play();
          log('Video playing');
        } catch (playErr: any) {
          log('Play error: ' + playErr.message);
        }
      }
      setError(null);
    } catch (err: any) {
      console.warn("Camera access failed", err);
      log('Error: ' + err.message);
      setError("Could not access camera. " + err.message);
    }
  }, []);

  const stopCamera = useCallback(() => {
    if (streamRef.current) {
      log('Stopping camera tracks');
      streamRef.current.getTracks().forEach(track => track.stop());
      streamRef.current = null;
    }
  }, []);

  // Re-attach stream when returning to video mode (after capture reset)
  useEffect(() => {
    if (!capturedImage && isActive && streamRef.current && videoRef.current) {
      // Stream exists but video element was just remounted
      videoRef.current.srcObject = streamRef.current;
      videoRef.current.play().catch(e => console.log('Play error on resume:', e));
    }
  }, [capturedImage, isActive]);

  // Initial Start
  useEffect(() => {
    let mounted = true;
    if (isActive && mounted) {
      // Only request new stream if we don't have one (or device changed)
      if (!streamRef.current) {
        startCamera(selectedDeviceId || undefined);
      }
    } else {
      stopCamera();
    }
    return () => {
      mounted = false;
      stopCamera();
    };
  }, [isActive, selectedDeviceId]); // Re-run if selectedDeviceId changes

  const handleCapture = () => {
    if (videoRef.current && canvasRef.current) {
      const video = videoRef.current;
      const canvas = canvasRef.current;

      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;

      const ctx = canvas.getContext('2d');
      if (ctx) {
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
        const dataUrl = canvas.toDataURL('image/jpeg', 0.85);
        setCapturedImage(dataUrl);
      }
    }
  };

  const handleRetake = () => {
    setCapturedImage(null);
    if (onScanCancel) onScanCancel();
  };

  const handleConfirm = () => {
    if (capturedImage) {
      onCapture(capturedImage);
      // Do NOT clear capturedImage yet if we are waiting for ID result
      // But if no isProcessing/scanResult logic is used (legacy), we might want to?
      // For this workflow, parent sets isProcessing=true immediately?
      // Actually, let's keep capturedImage until explicit confirm or reset.
      // If we are NOT in async mode (no isProcessing passed), behave as before.
      if (isProcessing === undefined && scanResult === undefined) {
        setCapturedImage(null);
      }
    }
  };

  const handleFinalConfirm = () => {
    if (onScanConfirm) {
      onScanConfirm();
      // NOW we reset
      setCapturedImage(null);
    }
  };

  const handleSaveAndFinish = () => {
    handleConfirm();
    onClose();
  };

  if (!isActive) return null;

  return (
    <div className="fixed inset-0 z-[100] bg-black flex flex-col items-center justify-center animate-in fade-in duration-300">
      {/* Header / Top Controls */}
      <div className="absolute top-0 left-0 right-0 p-6 z-50 flex justify-between items-start bg-gradient-to-b from-black/80 to-transparent">
        {/* Camera Switcher */}
        <div className="flex flex-col gap-1">
          {devices.length > 1 && (
            <select
              className="bg-black/50 text-white text-sm py-2 px-4 rounded-full backdrop-blur-md border border-white/20 outline-none hover:bg-black/70 transition-all appearance-none cursor-pointer"
              value={selectedDeviceId}
              onChange={(e) => setSelectedDeviceId(e.target.value)}
              disabled={!!capturedImage}
            >
              <option value="">Default Camera</option>
              {devices.map((d, i) => (
                <option key={d.deviceId} value={d.deviceId}>{d.label || `Camera ${i + 1}`}</option>
              ))}
            </select>
          )}
        </div>

        {/* Close Button */}
        <button
          onClick={onClose}
          className="group flex flex-col items-center gap-1 text-white/80 hover:text-white transition-colors"
        >
          <div className="p-2 bg-white/10 group-hover:bg-red-500/80 rounded-full backdrop-blur-md transition-all">
            <X className="w-6 h-6" />
          </div>
          <span className="text-[10px] font-bold uppercase tracking-wider">Close</span>
        </button>
      </div>

      {/* Main Content */}
      <div className="w-full h-full bg-black relative flex items-center justify-center">
        {error ? (
          <div className="text-white text-center p-4 z-50">
            <p className="text-xl mb-4 text-red-400">{error}</p>
            <pre className="text-xs text-left bg-gray-900 p-2 rounded max-w-md mx-auto overflow-auto max-h-40">{debugLog}</pre>
            <div className="flex gap-2 justify-center mt-4">
              <button onClick={() => startCamera(selectedDeviceId)} className="bg-blue-600 px-6 py-2 rounded-lg">Retry</button>
              <button onClick={onClose} className="bg-gray-600 px-6 py-2 rounded-lg">Cancel</button>
            </div>
          </div>
        ) : (
          <>
            {/* Full Screen Viewport */}
            <div className="w-full h-full relative">
              {!capturedImage ? (
                <>
                  <video
                    ref={videoRef}
                    autoPlay
                    playsInline
                    muted
                    className="w-full h-full object-cover"
                  />

                  {/* Auto-Capture Overlay */}
                  {autoCaptureEnabled && stabilityProgress > 0 && (
                    <div className="absolute inset-0 pointer-events-none flex items-center justify-center">
                      <div className="w-64 h-64 rounded-xl border-2 border-white/50 relative transition-all duration-200" style={{ transform: `scale(${1 + (stabilityProgress / 500)})` }}>
                        <div className="absolute top-0 left-0 h-1 bg-green-500 transition-all duration-200" style={{ width: `${stabilityProgress}%` }}></div>
                        <div className="absolute bottom-0 right-0 h-1 bg-green-500 transition-all duration-200" style={{ width: `${stabilityProgress}%` }}></div>
                        <div className="absolute -top-10 left-0 right-0 text-center">
                          <span className="bg-black/50 text-green-400 font-bold px-3 py-1 rounded-full text-sm backdrop-blur-sm">
                            {statusMessage} {Math.round(stabilityProgress)}%
                          </span>
                        </div>
                      </div>
                    </div>
                  )}

                  <div className="absolute bottom-24 left-0 right-0 text-center pointer-events-none">
                    <p className="inline-block bg-black/50 text-white/80 text-sm px-4 py-2 rounded-full backdrop-blur-sm border border-white/10 transition-all">
                      {autoCaptureEnabled ? (statusMessage || "Align paper to auto-scan") : "Align the paper within the screen"}
                    </p>
                  </div>
                </>
              ) : (
                <div className="relative w-full h-full">
                  <img src={capturedImage} alt="Captured" className="w-full h-full object-contain bg-black" />

                  {/* Processing Overlay */}
                  {isProcessing && (
                    <div className="absolute inset-0 bg-black/60 backdrop-blur-sm flex flex-col items-center justify-center z-50">
                      <div className="w-16 h-16 border-4 border-indigo-500 border-t-transparent rounded-full animate-spin mb-4"></div>
                      <p className="text-white font-bold text-lg animate-pulse">Identifying Student...</p>
                    </div>
                  )}

                  {/* Result Overlay */}
                  {!isProcessing && scanResult && (
                    <div className="absolute inset-0 bg-black/80 backdrop-blur-md flex flex-col items-center justify-center z-50 p-6 animate-in zoom-in duration-300">
                      <div className="bg-white dark:bg-slate-800 p-8 rounded-3xl max-w-sm w-full shadow-2xl text-center space-y-6">
                        <div className="mx-auto w-20 h-20 bg-green-100 dark:bg-green-900/30 rounded-full flex items-center justify-center">
                          <Check className="w-10 h-10 text-green-600 dark:text-green-400" />
                        </div>
                        <div>
                          <h3 className="text-slate-500 dark:text-slate-400 text-sm font-bold uppercase tracking-wider mb-2">Identified Student</h3>
                          <p className="text-3xl font-black text-slate-800 dark:text-white leading-tight">
                            {scanResult.studentName || 'Unknown Student'}
                          </p>
                          <p className="text-slate-400 text-xs mt-2">Confidence: {scanResult.confidence}</p>
                        </div>
                        <div className="grid grid-cols-2 gap-4 pt-4 border-t border-slate-100 dark:border-slate-700">
                          <button
                            onClick={handleRetake}
                            className="py-3 px-4 rounded-xl font-bold text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors"
                          >
                            Try Again
                          </button>
                          <button
                            onClick={handleFinalConfirm}
                            className="py-3 px-4 rounded-xl font-bold bg-indigo-600 text-white hover:bg-indigo-700 shadow-lg shadow-indigo-200 dark:shadow-none transition-all hover:scale-105 active:scale-95"
                          >
                            Confirm & Grade
                          </button>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Debug Logs (Subtle) */}
            <div className="absolute bottom-0 left-0 bg-black/80 text-white/30 text-[9px] p-1 pointer-events-none max-w-xs truncate z-40 m-2 rounded">
              {debugLog.split('\n').slice(-1)[0]}
            </div>

            {/* Bottom Controls */}
            <div className="absolute bottom-8 left-0 right-0 flex justify-center items-center gap-12 z-50">
              {!capturedImage ? (
                <>
                  {/* Auto Capture Toggle */}
                  <button
                    onClick={() => setAutoCaptureEnabled(!autoCaptureEnabled)}
                    className={`absolute left-8 flex flex-col items-center gap-1 p-2 rounded-xl transition-all ${autoCaptureEnabled ? 'bg-indigo-600/50 text-white' : 'bg-white/10 text-white/50'}`}
                  >
                    <div className="text-[10px] font-bold uppercase">{autoCaptureEnabled ? 'Auto On' : 'Auto Off'}</div>
                  </button>

                  <button
                    onClick={handleCapture}
                    className="w-24 h-24 rounded-full bg-white/20 backdrop-blur-sm border-4 border-white shadow-xl hover:scale-105 active:scale-95 transition-all flex items-center justify-center relative"
                  >
                    {/* Progress Ring if Auto Capturing */}
                    {autoCaptureEnabled && stabilityProgress > 0 && (
                      <svg className="absolute inset-0 w-full h-full -rotate-90 pointer-events-none" viewBox="0 0 100 100">
                        <circle cx="50" cy="50" r="46" fill="none" stroke="black" strokeWidth="4" strokeOpacity="0.2" />
                        <circle cx="50" cy="50" r="46" fill="none" stroke="#22c55e" strokeWidth="4" strokeDasharray="290" strokeDashoffset={290 - (290 * stabilityProgress / 100)} className="transition-all duration-200" />
                      </svg>
                    )}
                    <div className="w-20 h-20 rounded-full bg-red-600 border-2 border-white/50 shadow-inner"></div>
                  </button>
                </>
              ) : (
                <>
                  <button
                    onClick={handleRetake}
                    className="flex flex-col items-center text-white gap-2 hover:opacity-80 transition-opacity"
                  >
                    <div className="p-4 bg-gray-800/80 rounded-full backdrop-blur-md border border-white/10">
                      <RefreshCw className="w-8 h-8" />
                    </div>
                    <span className="text-xs font-bold uppercase tracking-wider shadow-black drop-shadow-md">Retake</span>
                  </button>

                  <button
                    onClick={handleConfirm}
                    className="flex flex-col items-center text-white gap-2 hover:opacity-80 transition-opacity"
                  >
                    <div className="p-4 bg-green-600 rounded-full backdrop-blur-md shadow-lg shadow-green-900/50 border border-white/20">
                      <Check className="w-8 h-8" />
                    </div>
                    <span className="text-xs font-bold uppercase tracking-wider shadow-black drop-shadow-md">Identify</span>
                  </button>

                  <button
                    onClick={handleSaveAndFinish}
                    className="flex flex-col items-center text-white gap-2 hover:opacity-80 transition-opacity"
                  >
                    <div className="p-4 bg-indigo-600 rounded-full backdrop-blur-md shadow-lg shadow-indigo-900/50 border border-white/20">
                      <CheckCircle className="w-8 h-8" />
                    </div>
                    <span className="text-xs font-bold uppercase tracking-wider shadow-black drop-shadow-md">Save & Finish</span>
                  </button>
                </>
              )}
            </div>


            <canvas ref={canvasRef} className="hidden" />
          </>
        )}
      </div>
    </div>
  );
};
