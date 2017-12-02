# Native Microphone Service

Web Audio can be really crap sometimes. Recording a microphone is one such example. Eventually I just got fed up and decided to use a native Cordova plug-in.

This repo is a minimal Ionic test app with the native microphone provider. It was created to do testing on a range of devices where skip-free audio recording using Web Audio is apparently too much to ask.

One benefit of using a native recording plugin is that we can request a different sample rate other than the 48Khz default.

## Basic features

The microphone service is a wrapper around a Cordova plug-in. This service keeps a list of recording segments so allow for undo use cases. Tracking elapsed time is performed using an independent timer and an observable.

## Notes

Based on https://github.com/edimuj/cordova-plugin-audioinput 

This plug-in is maintained by several people. If we all contributed to upstream projects like this then it would go some tiny way to repairing the poor open source culture in Cordova land.

