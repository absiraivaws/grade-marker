import React, { useRef, useState, useCallback, useEffect } from 'react';
import { Camera, X, Check, RefreshCw } from 'lucide-react';

interface WebcamScannerProps {
  onCapture: (imageData: string) => void;
  onClose: () => void;
  isActive: boolean;
}

export const WebcamScanner: React.FC<WebcamScannerProps> = ({ onCapture, onClose, isActive }) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  // Use ref to track stream so we don't restart effect when stream state changes
  const streamRef = useRef<MediaStream | null>(null);
  const [capturedImage, setCapturedImage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [debugLog, setDebugLog] = useState<string>('');

  // Camera Selection
  const [devices, setDevices] = useState<MediaDeviceInfo[]>([]);
  const [selectedDeviceId, setSelectedDeviceId] = useState<string>('');

  const log = (msg: string) => setDebugLog(prev => prev + '\n' + msg);

  // 1. Fetch available cameras on mount
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

  // Initial Start
  useEffect(() => {
    let mounted = true;
    if (isActive && mounted) {
      // Don't pass deviceId initially to let browser pick default, unless we have one stored/selected
      startCamera(selectedDeviceId || undefined);
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
  };

  const handleConfirm = () => {
    if (capturedImage) {
      onCapture(capturedImage);
      setCapturedImage(null);
    }
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
                  <div className="absolute bottom-24 left-0 right-0 text-center pointer-events-none">
                    <p className="inline-block bg-black/50 text-white/80 text-sm px-4 py-2 rounded-full backdrop-blur-sm border border-white/10">
                      Align the paper within the screen
                    </p>
                  </div>
                </>
              ) : (
                <img src={capturedImage} alt="Captured" className="w-full h-full object-contain bg-black" />
              )}
            </div>

            {/* Debug Logs (Subtle) */}
            <div className="absolute bottom-0 left-0 bg-black/80 text-white/30 text-[9px] p-1 pointer-events-none max-w-xs truncate z-40 m-2 rounded">
              {debugLog.split('\n').slice(-1)[0]}
            </div>

            {/* Bottom Controls */}
            <div className="absolute bottom-8 left-0 right-0 flex justify-center items-center gap-12 z-50">
              {!capturedImage ? (
                <button
                  onClick={handleCapture}
                  className="w-24 h-24 rounded-full bg-white/20 backdrop-blur-sm border-4 border-white shadow-xl hover:scale-105 active:scale-95 transition-all flex items-center justify-center"
                >
                  <div className="w-20 h-20 rounded-full bg-red-600 border-2 border-white/50 shadow-inner"></div>
                </button>
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
                    <span className="text-xs font-bold uppercase tracking-wider shadow-black drop-shadow-md">Use Photo</span>
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
