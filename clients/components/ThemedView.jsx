import { useColorScheme, View } from "react-native";
import Colors from "../constants/Color";
import React from "react";

const ThemedView = ({ style, children, ...props }) => {
  const colorScheme = useColorScheme();
  const theme = Colors[colorScheme] ?? Colors.light;

  return (
    <View
      style={[
        {
          backgroundColor: theme.background,
          margin: 5,
        },
        style,
      ]}
      {...props}
    >
      {children}
    </View>
  );
};

export default ThemedView;
