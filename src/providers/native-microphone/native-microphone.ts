import { Injectable } from '@angular/core'
import { Subject } from 'rxjs/Subject'
import { Observable } from 'rxjs/Observable'

declare var audioinput: any

export interface RecordStats {
  frames: number
  offset: number
  ms: number
}
export interface MicOptions {
  bufferSize?: number,
  channels?: number,
  sampleRate?: number
  streamToWebAudio?: boolean
  format?: string
  concatenateMaxChunks?: number
  audioContext?: AudioContext
  normalization?: boolean
  fileUrl?: string
  normalizationFactor?: number
  audioSourceType: number
}
export interface RecordStats {
  frames: number
  offset: number
  ms: number
}

@Injectable()
export class NativeMicrophone {
  progressSubject: Subject<any> = new Subject()
  defaultOptions: MicOptions = {
    sampleRate: 16000,
    streamToWebAudio: false,
    bufferSize: 2048,
    normalization: false,
    //normalizationFactor: 32767.0,
    channels: 1,
    format: "PCM_16BIT",
    concatenateMaxChunks: 10,
    fileUrl: null,
    audioSourceType: 1
  }
  customOptions: MicOptions
  ctx: AudioContext 
  hasData: boolean = false
  currentBuffer: number[] = []
  finalBuffers: Float32Array[] = []
  initialized: boolean = false
  stopping: boolean = false
  audioInputEventFunction = this._audioinputListener.bind(this)
  audioErrorEventFunction = this._errorListener.bind(this)
  progressInterval: number
  startTime: Date
  paused: boolean
  elapsedTime: number = 0
  stopLoops: number = 0
  constructor() {
    
  }
  async connect(options: MicOptions = null, audioCtx: AudioContext = null, progressInterval: number = 100): Promise<any> {
    const _checkPerm = (): Promise<boolean> =>  {
      return new Promise((resolve) => {
        audioinput.checkMicrophonePermission((yesno: boolean) => {
          resolve(yesno)
        })
      })
    }
    const _getPerm = (): Promise<boolean> => {
      return new Promise((resolve) => {
        audioinput.getMicrophonePermission((success: boolean) => {
          resolve(success)
        })
      })
    }
    if (!(await _checkPerm())) {
      if (!(await _getPerm())) {
        throw new Error('Microphone recording permission denied.')
      }
    }
    if (audioCtx) {
      this.ctx = audioCtx
    } else if (!this.ctx) {
      this.ctx = new AudioContext()
    }
    this.progressInterval = progressInterval
    // apply passed config to defaults
    let cfg = Object.assign({}, this.defaultOptions)
    if (options) {
      Object.assign(cfg, options)
    }
    this.customOptions = cfg
    this.currentBuffer = []
    this.finalBuffers = []
    this.elapsedTime = 0
    this.hasData = false  
    audioinput.initialize(this.customOptions)
    if (!this.initialized) {
      console.log('initializing listeners')
      window.addEventListener('audioinput', this.audioInputEventFunction, false)
      window.addEventListener("audioinputerror", this.audioErrorEventFunction, false)
      this.initialized = true
    }
  }

  destroy() {
    if (this.initialized) {
      window.removeEventListener( "audioinput", this.audioInputEventFunction)
      window.removeEventListener( "audioinputerror", this.audioErrorEventFunction)
      this.initialized = false
    }
  }


  // Can we begin a recording
  canRecord(): boolean {
    return this.initialized && audioinput.isCapturing() && !this.stopping
  }

  record() {
    console.log('mic: record()')
    audioinput.start(this.customOptions)
    this.startTime = new Date()
    this.elapsedTime = 0
    this._progressTick()
  }

  async stop(): Promise<RecordStats> {
    if (!audioinput.isCapturing() && !this.paused) {
      throw new Error('Called stop when not capturing and not paused.')
    }
    if (this.stopping) {
      throw new Error('Called stop() when already stopping.')
    }
    // If we are recording... then empty the buffer and stuff - if not, we were paused
    if (audioinput.isCapturing()) {
      // There's probably a nice way to do this by using some direct signalling from
      // the audioinput listener
      this.stopping = true
      let loop = 0
      while (this.stopping && loop < 50) {
        await this._waitMs(50)
        ++loop
      }
      if (loop === 50) {
        audioinput.stop()
        throw new Error('stop() did not get valid stop state after 2000ms.')
      }
    }
    this.paused = false
    if (this.currentBuffer.length !== 0) {
      let ab = new Float32Array(this.currentBuffer)
      this.finalBuffers.push(ab)
      this.currentBuffer = []
    }
    this.elapsedTime = 0
    this.hasData = this.finalBuffers.length > 0
    return this.getLastlength()
  }

  // should be called only when stopped?
  getElapsed() {
    return this.getTotalLength().ms
  }

  observeProgress(): Observable<number> {
    return this.progressSubject.asObservable()
  }

  isRecording(): boolean {
    return audioinput.isCapturing()
  }

  isPaused(): boolean {
    return this.paused
  }

  hasRecordedData(): boolean {
    return this.hasData
  }

  clear(): void {
    if (audioinput.isCapturing()) {
      throw new Error('Called clear() when capturing.')
    }
    if (this.stopping) {
      throw new Error('Called clear() when stopping.')
    }
    this.currentBuffer = []
    this.finalBuffers = []
    this.elapsedTime = 0
    this.hasData = false  
    this._updateStopProgress()
  }

  clearlast(): void {
    if (this.finalBuffers.length > 0) {
      this.finalBuffers.pop()
      if (this.finalBuffers.length === 0) {
        this.hasData = false
      }
      this._updateStopProgress()
    }
  }

  // Cancel action stops recorder and kills current recording segment
  cancel(): void {
    if (audioinput.isCapturing()) {
      audioinput.stop()
    }
    this.currentBuffer = []
    this.paused = false
  }

  async pause(): Promise<any> {
    if (this.paused) {
      throw new Error('Called pause() but is already paused.')
    }
    if (!audioinput.isCapturing()) {
      throw new Error('Called pause() but is not recording.')
    }
    console.log('mic: pause()')
    this.stopping = true
    let loop = 0
    while (this.stopping && loop < 50) {
      await this._waitMs(50)
      ++loop
    }
    if (loop === 50) {
      audioinput.stop()
      throw new Error('stop() did not get valid stop state after 2000ms.')
    }
    this.paused = true
    this.elapsedTime += ((new Date()).valueOf() - this.startTime.valueOf())
  }

  resume(): void {
    if (!this.paused) {
      throw new Error('Called resume() but is not paused.')
    }
    console.log('mic: resume()')
    this.paused = false
    this.startTime = new Date()
    audioinput.start(this.customOptions)
    this._progressTick()
  }

  getTotalLength(): { frames: number, ms: number } {
    let frames = 0
    for (let bi = 0; bi < this.finalBuffers.length; ++bi) {
      frames += this.finalBuffers[bi].length
    }
    return {
      ms: Math.floor((frames / audioinput.getCfg().sampleRate) * 1000),
      frames: frames
    }
  }

  getBuffer(): Float32Array {
    let tlen = 0
    for (let rbuf of this.finalBuffers) {
      tlen += rbuf.length
    }
    let combo = new Float32Array(tlen) // make one big float32 array to fit all buffers
    let offset = 0
    for (let recSeg of this.finalBuffers) {
      combo.set(recSeg, offset)
      offset += recSeg.length
    }
    return combo
  }


  getLastlength (): RecordStats {
    if (this.finalBuffers.length === 0) {
      return { offset: 0, frames: 0, ms: 0}
    } else {
      let tl = 0, offset, frames, ms
      for (let bi = 0; bi < this.finalBuffers.length; ++bi) {
        if (bi < this.finalBuffers.length - 1) {
          tl += this.finalBuffers[bi].length
        } else {
          offset = tl
          frames = this.finalBuffers[bi].length
          ms = Math.floor((frames / audioinput.getCfg().sampleRate) * 1000)
        }
      }
      return { offset: offset, frames: frames, ms: ms }
    }
  }

  getSegments(): RecordStats[] {
    if (!this.initialized) {
      throw new Error('getSegments() called but not initialized.')
    }
    let sr = this.customOptions.sampleRate
    let segs = []
    let offset = 0
    for (let fb of this.finalBuffers) {
      segs.push({
        offset: offset,
        frames: fb.length,
        ms: Math.floor((fb.length / sr) * 1000)
      })
    }
    return segs
  }

  async playLast(): Promise<any> {
    if (this.finalBuffers.length === 0) {
      throw new Error('playLast() called but no recorded data.')
    }
    let lb = this.finalBuffers[this.finalBuffers.length - 1]
    let fa = Float32Array.from(lb)
    await this._play32Array(fa)
  }

  async playSegment(segment: number): Promise<any> {
    if (segment === null || segment > this.finalBuffers.length -1 ) {
      throw new Error('playSegment() segment invalid.')
    }
    let lb = this.finalBuffers[segment]
    let fa = Float32Array.from(lb)
    await this._play32Array(fa)
  }

  _progressTick() {
    setTimeout(() => {
      if (audioinput.isCapturing()) {
        this._reportProgress()
        this._progressTick()
      }
    }, this.progressInterval)
  }

  _reportProgress() {
    let nd = new Date()
    let ms = (nd.valueOf() - this.startTime.valueOf()) // elapsed of this segment
    // calculate offset time of this segment
    let ts = 0
    for (let f of this.finalBuffers) {
      ts += f.length
    }
    let ot = ts ? Math.round((ts / this.customOptions.sampleRate) * 1000) : 0
    // elapsed time is length of final buffers (ot), length since this rec start (ms) and paused elapsed times (elapsedTime)
    this.progressSubject.next(this.elapsedTime + ot + ms) 
  }

  _updateStopProgress() {
    let ts = 0
    for (let f of this.finalBuffers) {
      ts += f.length
    }
    let t = ts ? Math.round((ts / this.customOptions.sampleRate) * 1000) : 0
    this.progressSubject.next(t)
  }

  _play32Array(fa: Float32Array): Promise<any> {
    let myArrayBuffer = this.ctx.createBuffer(1, fa.length, 16000)
    myArrayBuffer.copyToChannel(fa, 0)
    let source = this.ctx.createBufferSource()
    source.buffer = myArrayBuffer
    source.connect(this.ctx.destination)
    return new Promise((resolve) => {
      source.onended = () => {
        resolve()
      }
      source.start()
    })
  }

  _waitMs(milliseconds: number): Promise<any> {
    return new Promise((resolve) => {
      setTimeout(() =>  {
        resolve()
      }, milliseconds)
    })
  }
  _audioinputListener(evt)  {
    this.currentBuffer.push(...evt.data.slice()) // I wonder about performance
    if (this.stopping) {
      ++this.stopLoops
      if (this.stopLoops === 2) { // grab a couple of buffer iterations to avoid truncated audio
        this.stopping = false
        audioinput.stop()
        this.stopLoops = 0
      }
    }
  }
  _errorListener(evt) {
    console.log('micrphone error', evt)
  }

}
