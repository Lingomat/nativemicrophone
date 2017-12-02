import { Component } from '@angular/core';
import { NavController, Platform } from 'ionic-angular';
import { NativeMicrophoneProvider,  RecordStats } from '../../providers/native-microphone/native-microphone'

@Component({
  selector: 'page-home',
  templateUrl: 'home.html'
})
export class HomePage {
  ctx: AudioContext = new AudioContext()
  elapsedTime: string = ''
  segments: RecordStats[] = []
  constructor(
    public navCtrl: NavController, 
    public mic:  NativeMicrophoneProvider,
    public platform: Platform) {
    
  }

  async ngOnInit() {
    this.elapsedTime = this.getNiceTime(0)
    await this.platform.ready()
    console.log('platform ready')
    this.mic.connect()
    this.mic.observeProgress().subscribe((e) => {
      this.elapsedTime = this.getNiceTime(e)
    })
  }

  async clickRecord() {
    if (this.mic.isRecording()) {
      // stop
      let rs = await this.mic.stop()
      console.log('stop', rs)
      this.segments = this.mic.getSegments()
    } else {
      // start
      this.mic.record()
    }
  }

  clickSegment(seg: number) {
    this.mic.playSegment(seg)
  }

  hasData(): boolean {
    return this.mic.hasRecordedData()
  }

  clickPlay() {
    console.log('click play')
    let buff = this.mic.getBuffer()
    let myArrayBuffer = this.ctx.createBuffer(1, buff.length, 16000)
    myArrayBuffer.copyToChannel(buff, 0);
    let source = this.ctx.createBufferSource()
    source.buffer = myArrayBuffer
    source.connect(this.ctx.destination);
    source.start()
  }

  test() {
    let myArrayBuffer = this.ctx.createBuffer(1, 16000, 16000)
    let nowBuffering = myArrayBuffer.getChannelData(0);
    for (var i = 0; i < 16000; i++) {
      nowBuffering[i] = Math.random() * 2 - 1
    }
    let source = this.ctx.createBufferSource()
    source.buffer = myArrayBuffer
    source.connect(this.ctx.destination);
    source.start()
  }

  clickClear() {
    this.mic.clear()
    this.segments = []
  }
  clickClearLast() {
    this.mic.clearlast()
    this.segments = this.mic.getSegments()
  }

  isRecording() {
    return this.mic.isRecording()
  }

  // should be faster
  getNiceTime(milliseconds: number): string {
    let d = new Date(null)
    d.setMilliseconds(milliseconds)
    let m = d.getUTCMinutes().toLocaleString('en', {minimumIntegerDigits:2,minimumFractionDigits:0,useGrouping:false})
    let s = d.getUTCSeconds().toLocaleString('en', {minimumIntegerDigits:2,minimumFractionDigits:0,useGrouping:false})
    let ms = (d.getUTCMilliseconds() / 1000).toFixed(1).slice(1)
    return m + ':' + s + ms
  }

}
