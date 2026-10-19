import React from "react";
import { View, StyleSheet } from "react-native";

const Divboxwhite = ({ style, children, ...props }) => {
  return (
    <View style={[styles.divboxwhite, style]} {...props}>
      {children}
    </View>
  );
};

const styles = StyleSheet.create({
  divboxwhite: {
    backgroundColor: "white",
    padding: 10,
    margin: 5,
    borderRadius: 5,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
});

export default Divboxwhite;
