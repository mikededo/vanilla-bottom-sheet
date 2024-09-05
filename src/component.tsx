import React, { useState, useEffect, useRef, MouseEventHandler } from "react";
const between = (min: number, max: number, value: number) => {
  return value >= min && value <= max;
};

const MIN_BS_HEIGHT = 24;
const BS_TRANSITION_DURATION = "--bs-duration";
const withMinHeightLimit = (val: number) => Math.max(MIN_BS_HEIGHT, val);

type PartProps = { height: number; color: string };
export const Part: React.FC<PartProps> = ({ height, color }) => (
  <div
    style={{
      position: "fixed",
      height: (window?.innerHeight ?? 0) * height,
      left: 0,
      right: 0,
      bottom: 0,
      backgroundColor: color,
    }}
  >
    window.innerHeight * {height}
  </div>
);

type DragRef = {
  last: number;
  drag: number;
  from: number;
};

export const BottomSheet = () => {
  const [isDragging, setDragging] = useState(false);
  const [blockHeight, setBlockHeight] = useState(0);
  const block = useRef<HTMLDivElement>(null!);
  const { current: dragState } = useRef<DragRef>({
    last: 0,
    drag: 0,
    from: 0,
  });

  const updateDragState = (to: number) => {
    const deltaY = dragState.last - to;
    dragState.last = to;
    dragState.drag -= deltaY;
  };

  const animateTo = () => {
    const wH = window.innerHeight;
    const up = dragState.from - dragState.last > 0;
    const isTop = between(wH * 0.45, wH * 0.9, blockHeight - dragState.drag);
    const isMiddle = between(
      wH * 0.05,
      wH * 0.45,
      blockHeight - dragState.drag,
    );

    if (isMiddle && up) {
      return wH * 0.5;
    } else if (isTop && up) {
      return wH * 0.9;
    } else if (isTop && !up) {
      return wH * 0.5;
    }
    return 0;
  };

  const handleOnMove = (e: MouseEvent) => {
    if (!isDragging) {
      return;
    }

    updateDragState(e.clientY);

    block.current.style.transition = "height 0.15s ease-out";
    block.current.style.height = `${withMinHeightLimit(
      blockHeight - dragState.drag,
    )}px`;
  };

  const handleMouseDown: MouseEventHandler = (e) => {
    e.preventDefault();

    dragState.from = e.clientY;
    dragState.last = e.clientY;
    setDragging(true);
  };

  const handleMouseUp = () => {
    setDragging(false);

    // Move to mid-height
    const to = animateTo();
    block.current.style.transition =
      "height 0.35s cubic-bezier(0.22, 1, 0.36, 1)";
    block.current.style.height = `${withMinHeightLimit(to)}px`;

    // Reset variables
    setBlockHeight(withMinHeightLimit(to));
    dragState.drag = 0;
  };

  useEffect(() => {
    if (!block.current) {
      return;
    }

    console.log("calculate height");
    setBlockHeight(block.current.getBoundingClientRect().height);
  }, []);

  useEffect(() => {
    document.addEventListener("mousemove", handleOnMove);
    document.addEventListener("mouseup", handleMouseUp);

    return () => {
      document.removeEventListener("mousemove", handleOnMove);
      document.removeEventListener("mouseup", handleMouseUp);
    };
  }, [isDragging]);

  return (
    <>
      <Part height={1} color="#F3FEB8" />
      <Part height={0.75} color="#FFDE4D" />
      <Part height={0.5} color="#FFB22C" />
      <Part height={0.25} color="#FF4C4C" />
      <div
        ref={block}
        style={{
          boxShadow: "0 8px 32px 5px rgba(0 0 0 / 0.2)",
          backgroundColor: "#fefefe",
          borderTopLeftRadius: 16,
          borderTopRightRadius: 16,
          position: "fixed",
          height: MIN_BS_HEIGHT,
          bottom: 0,
          left: 0,
          right: 0,
          transition: `height var(${BS_TRANSITION_DURATION}) var(${BS_TRANSITION_DURATION})`,
        }}
      >
        <div
          style={{ width: "100%", padding: 8 }}
          onMouseDown={handleMouseDown}
        >
          <div
            style={{
              height: 8,
              borderRadius: 9999,
              width: 48,
              backgroundColor: "#e3e3e3",
              margin: "auto",
            }}
          ></div>
          <div>
            <p>Height: {blockHeight}</p>
            <p>Last: {dragState.last}</p>
            <p>Drag: {dragState.drag}</p>
            <p>From: {dragState.from}</p>
          </div>
        </div>
      </div>
    </>
  );
};
