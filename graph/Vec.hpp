#ifndef VEC_HPP_
#define VEC_HPP_

#include <algorithm>
#include <cmath>

struct Vec2 {
  float x = 0.f;
  float y = 0.f;

  constexpr Vec2() = default;
  constexpr explicit Vec2(float v) : x(v), y(v) {}
  constexpr Vec2(float x, float y) : x(x), y(y) {}

  constexpr Vec2 operator+(Vec2 o) const { return {x + o.x, y + o.y}; }
  constexpr Vec2 operator-(Vec2 o) const { return {x - o.x, y - o.y}; }
  constexpr Vec2 operator*(float s) const { return {x * s, y * s}; }
  constexpr Vec2 operator/(float s) const { return {x / s, y / s}; }

  constexpr Vec2& operator+=(Vec2 o) {
    x += o.x;
    y += o.y;
    return *this;
  }
  constexpr Vec2& operator-=(Vec2 o) {
    x -= o.x;
    y -= o.y;
    return *this;
  }
  constexpr Vec2& operator*=(float s) {
    x *= s;
    y *= s;
    return *this;
  }
  constexpr Vec2& operator/=(float s) {
    x /= s;
    y /= s;
    return *this;
  }
};

constexpr Vec2 operator*(float s, Vec2 v) {
  return {s * v.x, s * v.y};
}

inline float Length(Vec2 v) {
  return std::sqrt(v.x * v.x + v.y * v.y);
}

inline float Distance(Vec2 a, Vec2 b) {
  return Length(b - a);
}

constexpr Vec2 Clamp(Vec2 v, Vec2 lo, Vec2 hi) {
  return {std::clamp(v.x, lo.x, hi.x), std::clamp(v.y, lo.y, hi.y)};
}

struct Vec4 {
  float x = 0.f;
  float y = 0.f;
  float z = 0.f;
  float w = 0.f;

  constexpr Vec4() = default;
  constexpr Vec4(float x, float y, float z, float w) : x(x), y(y), z(z), w(w) {}
};

constexpr Vec4 Mix(Vec4 a, Vec4 b, float t) {
  return {
      a.x + (b.x - a.x) * t,
      a.y + (b.y - a.y) * t,
      a.z + (b.z - a.z) * t,
      a.w + (b.w - a.w) * t,
  };
}

#endif  // VEC_HPP_
