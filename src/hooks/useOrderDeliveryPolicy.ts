"use client";
import {useEffect,useState} from "react";
import {orderDeliveryPolicyClientService,type OrderDeliveryPolicy} from "@/services/delivery/orderDeliveryPolicyClientService";
export function useOrderDeliveryPolicy(){const [policy,setPolicy]=useState<OrderDeliveryPolicy|null>(null);useEffect(()=>{let active=true;void orderDeliveryPolicyClientService.getPolicy().then((value)=>{if(active)setPolicy(value);}).catch(()=>{});return()=>{active=false;};},[]);return policy;}
