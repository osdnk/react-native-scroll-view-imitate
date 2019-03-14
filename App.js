import React, { Component } from 'react'
import { StyleSheet, View, ScrollView, Text } from 'react-native'
import { DangerZone, GestureHandler, Font, Icon
} from 'expo'

const { Animated } = DangerZone
const {
  PanGestureHandler,
  TapGestureHandler,
  State,
} = GestureHandler



const MonoText = props => (
  <Text {...props} style={[props.style, { fontFamily: 'space-mono' }]} />
)

const magic = {
  damping: 7,
  mass: 1,
  stiffness: 121.6,
  overshootClamping: false,
  restSpeedThreshold: 0.001,
  restDisplacementThreshold: 0.001,
  deceleration: 0.999,
  bouncyFactor: 0.5,
  velocityFactor: 1.2
} // pls do it better

const {
  damping,
  mass,
  stiffness,
  overshootClamping,
  restSpeedThreshold,
  restDisplacementThreshold,
  deceleration,
  bouncyFactor,
  velocityFactor
} = magic;



const { set, cond, onChange, block, eq, add, and, sqrt, Value, abs, spring, or, divide, greaterThan, sub,event, diff, multiply, clockRunning, startClock, stopClock, decay, Clock, lessThan } = Animated

function withEnhancedLimits(val, min, max, state, springClock) {
  const prev = new Animated.Value(0)
  const limitedVal = new Animated.Value(0)
  const flagWasRunSpring = new Animated.Value(0)
  //const springClock = new Clock()
  return block([
    cond(eq(state, State.BEGAN),[
      set(prev, val),
      set(flagWasRunSpring, 0),
      stopClock(springClock)
    ], [
      cond(or(and(eq(state, State.END), or(lessThan(limitedVal, min), greaterThan(limitedVal, max))), flagWasRunSpring),
        [
          set(flagWasRunSpring, 1),
          cond(lessThan(limitedVal, min),
            set(limitedVal, runSpring(springClock, limitedVal, diff(limitedVal), min))
          ),
          cond(greaterThan(limitedVal, max),
            set(limitedVal, runSpring(springClock, limitedVal, diff(limitedVal), max))
          ),
        ],
        [
          set(limitedVal, add(limitedVal, sub(val, prev))),
          cond(and(lessThan(limitedVal, min), lessThan(val, prev)),
            // derivate of sqrt
            [
              // revert
              set(limitedVal, add(limitedVal)),
              // and use derivative of sqrt(x)
              set(limitedVal,
                sub(limitedVal,
                  multiply(
                    (divide(1, multiply(bouncyFactor, sqrt(abs(sub(min, sub(limitedVal, sub(prev, val)))))))),
                    (sub(prev, val))
                  )
                )
              ),
            ]
          ),
          cond(and(greaterThan(limitedVal, max)),
            // derivate of sqrt
            [
              // revert
              set(limitedVal, add(limitedVal, sub(prev, val))),
              // and use derivative of sqrt(x)
              set(limitedVal,
                add(limitedVal,
                  multiply(
                    (divide(1, multiply(bouncyFactor, sqrt(abs(sub(add(limitedVal, sub(val, prev)), max)))))),
                    (sub(val, prev))
                  )
                )
              ),
            ]
          ),
          set(prev, val),
        ]
      ),
    ]),
    limitedVal,
  ])
}

function runDecay(clock, value, velocity, wasStartedFromBegin) {
  const state = {
    finished: new Value(0),
    velocity: new Value(0),
    position: new Value(0),
    time: new Value(0),
  }

  const config = { deceleration }

  return [
    cond(clockRunning(clock), 0, [
      cond(wasStartedFromBegin, 0, [
        set(wasStartedFromBegin, 1),
        set(state.finished, 0),
        set(state.velocity, multiply(velocity, velocityFactor)),
        set(state.position, value),
        set(state.time, 0),
        startClock(clock),
      ]),
    ]),
    // set(state.position, value),
    decay(clock, state, config),
    cond(state.finished, stopClock(clock)),
    state.position,
  ]
}

function withPreservingMultiplicativeOffset (val, state) {
  const prev = new Animated.Value(1)
  const valWithPreservedOffset = new Animated.Value(1)
  return block([
    cond(eq(state, State.BEGAN), [
      set(prev, 1)
    ], [
      set(valWithPreservedOffset, multiply(valWithPreservedOffset, divide(val, prev))),
      set(prev, val),
    ]),
    valWithPreservedOffset
  ])
}

function withPreservingAdditiveOffset(drag, state) {
  const prev = new Animated.Value(0)
  const valWithPreservedOffset = new Animated.Value(0)
  return block([
    cond(eq(state, State.BEGAN), [
      set(prev, 0)
    ], [
      set(valWithPreservedOffset, add(valWithPreservedOffset, sub(drag, prev))),
      set(prev, drag),
    ]),
    valWithPreservedOffset
  ])
}

function withDecaying(drag, state, decayClock, velocity){
  const valDecayed = new Animated.Value(0)
  const offset = new Animated.Value(0)
  //const decayClock = new Clock()
  // since there might be moar than one clock
  const wasStartedFromBegin = new Animated.Value(0)
  return block([
    cond(eq(state, State.END),
      [
        set(valDecayed, runDecay(decayClock, add(drag, offset), velocity, wasStartedFromBegin))
      ],
      [
        stopClock(decayClock),
        cond(eq(state, State.BEGAN), [
          set(wasStartedFromBegin, 0),
          set(offset, add(sub(valDecayed, drag)))
        ]),
        set(valDecayed, add(drag, offset))

      ],
    ),
    valDecayed,
  ])
}


function runSpring(clock, value, velocity, dest) {
  const state = {
    finished: new Value(0),
    velocity: new Value(0),
    position: new Value(0),
    time: new Value(0),
  }

  const config = {
    damping,
    mass,
    stiffness,
    overshootClamping,
    restSpeedThreshold,
    restDisplacementThreshold,
    toValue: new Value(0),
  }

  return [
    cond(clockRunning(clock), 0, [
      set(state.finished, 0),
      set(state.velocity, velocity),
      set(state.position, value),
      set(config.toValue, dest),
      startClock(clock),
    ]),
    spring(clock, state, config),
    cond(state.finished, stopClock(clock)),
    state.position,
  ]
}


function withLimits(val, min, max, state){
  const offset = new Animated.Value(0)
  const offsetedVal = add(offset, val)
  return block([
    cond(eq(state, State.BEGAN),[
      cond(lessThan(offsetedVal, min),
        set(offset, sub(min, val))),
      cond(greaterThan(offsetedVal, max),
        set(offset, sub(max, val)))
    ]),
    cond(lessThan(offsetedVal, min), min, cond(greaterThan(offsetedVal, max), max, offsetedVal))
  ])
}

export default class Example extends Component {
  constructor(props) {
    super(props)
    const dragY = new Value(0)
    const panState = new Value(0)
    this.tapState = new Value(0)
    const velocity = new Value(0)


    this.handlePan = event([
      {
        nativeEvent: ({
          translationY: dragY,
          state: panState,
          velocityY: velocity
        })
      },
    ])


    this.handleTap = event([
      {
        nativeEvent: {
          state: this.tapState
        }
      },
    ])

    this.decayClock = new Clock()
    this.springClock = new Clock()
    this.Y = withEnhancedLimits(withDecaying(withPreservingAdditiveOffset(dragY, panState), panState, this.decayClock, velocity), -2000, 0, panState, this.springClock)
  }

  panRef = React.createRef();
  pinchRef = React.createRef();
  wasRunningBeforeTap = new Animated.Value(0);

  renderInner = () => (
    <React.Fragment>
      {[...Array(60)].map((e, i) => (
        <View key={i} style={{ width: 200, height: 40, backgroundColor: `#${i%10}88424` }}>
          <MonoText>
            computed
          </MonoText>
        </View>
      ))}
    </React.Fragment>
  )

  state = {
    ready: false
  }

  componentDidMount(){
    Font.loadAsync({
      // This is the font that we are using for our tab bar
      ...Icon.Ionicons.font,
      // We include SpaceMono because we use it in HomeScreen.js. Feel free
      // to remove this if you are not using it in your app
      'space-mono': require('./assets/fonts/SpaceMono-Regular.ttf'),
    }).then(() => this.setState({
      ready: true
    }))
  }

  render() {
    if (!this.state.ready) {
      return null;
    }
    return (
      <View style={styles.container}>
        <View
          style={{ height: 400, overflow: 'hidden' }}
        >
          <Animated.Code exec={onChange(this.tapState, cond(eq(this.tapState, State.BEGAN), [
            stopClock(this.decayClock),
            set(this.wasRunningBeforeTap, clockRunning(this.springClock)),
            stopClock(this.springClock),
          ],[
            cond(eq(this.tapState, State.END), cond(this.wasRunningBeforeTap, startClock(this.springClock))),
          ]))} />
          <PanGestureHandler
            ref={this.panRef}
            simultaneousHandlers={[this.pinchRef]}
            onGestureEvent={this.handlePan}
            onHandlerStateChange={this.handlePan}>
            <Animated.View>
              <TapGestureHandler
                onHandlerStateChange={this.handleTap}
              >
                <Animated.View style={{ width: '100%',
                  transform: [
                    { translateY: this.Y }
                  ]
                }}>
                  {this.renderInner()}
                </Animated.View>
              </TapGestureHandler>
            </Animated.View>
          </PanGestureHandler>
        </View>
        <View
          style={{ height: 200, overflow: 'hidden' }}
        >
          <ScrollView>
            {this.renderInner()}
          </ScrollView>
        </View>
      </View>

    )
  }
}

const IMAGE_SIZE = 200

const styles = StyleSheet.create({
  container: {
    flex: 1,
    flexDirection: 'row',
    backgroundColor: '#F5FCFF',
    justifyContent: 'center',
    alignItems: 'center',
  },
  box: {
    width: IMAGE_SIZE,
    height: IMAGE_SIZE,
  },
})

